import { EventEmitter } from 'events' // Додаємо вбудований модуль
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

/**
 * Основний клас для керування завантаженням LOB-об'єктів.
 * Підтримує Range-запити, Full Stream Fallback, Pause/Resume та детальне логування.
 */
export class BlobDownloader extends EventEmitter {
    /**
     * @param {Object} params
     * @param {Object} params.client - Екземпляр HttpClient (Base, Adaptive або Retry)
     * @param {FileStorage} params.storage - Екземпляр FileStorage
     * @param {Object} [params.logger] - Логер з підтримкою методів info/warn/error/child
     * @param {Object} params.config - Конфігурація завантаження
     */
    constructor({ client, storage, logger, config }) {
        super() // Ініціалізація подій
        this.client = client
        this.storage = storage
        this.logger = logger?.child?.({ component: 'BlobDownloader' }) || logger

        this.config = {
            defaultFileName: 'downloaded_asset.bin',
            chunkSize: 1024 * 1024,
            speedWindowSize: 10,
            ...config,
        }

        this.isPaused = false
        this.isAborted = false
        this.isFinished = false
        this.speedHistory = []
    }

    /** Поставити завантаження на паузу (тільки для Range-режиму) */
    pause() {
        // 1. Вже на паузі? Виходимо відразу.
        if (this.isFinished || this.isPaused) return

        // 2. Не підтримується пауза? Логуємо і виходимо.
        if (!this.isRangeSupported || !this.config.chunkSize) {
            this.logger?.warn?.(
                'Пауза неможлива: режим потокового завантаження не підтримує зупинку',
            )
            return
        }

        // 3. Основна логіка (успішний сценарій)
        this.isPaused = true
        this.logger?.info?.('⏸️ Завантаження поставлено на паузу.')
        this.emit('paused')
    }

    /** Відновити завантаження */
    resumeDownload() {
        if (this.isFinished || !this.isPaused) return

        this.isPaused = false
        this.logger?.info?.('▶️ Завантаження відновлено.')
        this.emit('resumed')
    }

    /** Повністю скасувати завантаження */
    abort() {
        if (this.isFinished) return

        this.isAborted = true
        this.isPaused = false
        this.logger?.warn?.('Завантаження скасовано користувачем')
        this.emit('aborted')
    }

    /**
     * Головний метод для запуску процесу
     */
    async download({ fresh = false, resume = true, noFile = false } = {}) {
        this.logger?.info?.('Ініціалізація завантаження', { url: this.config.url, fresh, resume })
        this.isFinished = false
        this.isAborted = false

        // 1. Метадані - ПЕРЕВІРКА ПІДТРИМКИ RANGE (PROBE)
        const probe = await fetch(this.config.url, {
            headers: { ...this.config.headers, Range: 'bytes=0-0' },
        })

        if (!probe.ok) throw new Error(`Probe failed: HTTP ${probe.status}`)

        this.isRangeSupported = probe.status === 206
        const contentRange = probe.headers.get('content-range')
        const contentLength = probe.headers.get('content-length')
        // Якщо 206 — беремо TOTAL з Content-Range, якщо 200 — беремо Content-Length
        const totalSize =
            this.isRangeSupported && contentRange
                ? parseInt(contentRange.split('/')[1], 10)
                : parseInt(contentLength, 10)

        if (!totalSize || isNaN(totalSize)) {
            throw new Error('Не вдалося визначити загальний розмір файлу.')
        }

        const expectedHash = probe.headers.get('x-expected-hash')?.toLowerCase()
        const fileName = this._parseFilename(probe.headers, this.config.defaultFileName)
        const finalPath = path.join(this.storage.directory, fileName)
        const tempPath = finalPath + '.tmp'

        this.logger?.info?.('Метадані отримано', {
            fileName,
            sizeMB: (totalSize / 1048576).toFixed(2),
            isRangeSupported: this.isRangeSupported,
        })

        // Скидаємо все, якщо сервер не підтримує Range, бо докачування неможливе
        if (!this.isRangeSupported) {
            resume = false
            this.storage.cleanup(tempPath)
        }

        // 2. Очищення для fresh
        if (fresh) {
            this.storage.cleanup(finalPath)
            this.storage.cleanup(tempPath)
        }

        // 3. Валідація існуючого
        if (!noFile && !fresh && fs.existsSync(finalPath)) {
            const stats = this.storage.getFileStats(finalPath)

            if (stats && expectedHash) {
                this.logger?.info?.('Файл вже існує, перевірка цілісності...', { finalPath })

                const currentHash = await this.storage.getFileHash(finalPath)
                if (currentHash.toLowerCase() === expectedHash.toLowerCase()) {
                    this.isFinished = true
                    this.logger?.info?.('Файл актуальний, завантаження пропущено')
                    this.emit('finish', {
                        status: 'exists',
                        fileName,
                        path: finalPath,
                        hashes: { actual: currentHash },
                    })
                    return
                }

                this.logger?.warn?.('Існуючий файл пошкоджений або застарілий. Перезавантаження...')
                this.storage.cleanup(finalPath)
            }
        }

        // 3. Логіка Resume
        let downloadedBytes = 0
        const hash = crypto.createHash('sha256')

        if (this.isRangeSupported && resume && !noFile && fs.existsSync(tempPath) && !fresh) {
            const stats = this.storage.getFileStats(tempPath)
            if (stats && stats.size > 0 && stats.size < totalSize) {
                downloadedBytes = stats.size
                this.logger?.info?.('Продовження завантаження тимчасового файлу', {
                    offset: downloadedBytes,
                })

                // ОНОВЛЕННЯ ХЕШУ ІСНУЮЧОЮ ЧАСТИНОЮ (СТРІМОМ)
                await this.storage.updateHashFromFile(tempPath, hash)
            }
        } else if (!noFile) {
            this.storage.cleanup(tempPath)
        }

        const fileStream = noFile
            ? null
            : fs.createWriteStream(tempPath, { flags: downloadedBytes > 0 ? 'a' : 'w' })
        const startTime = Date.now()
        this.speedHistory = []

        try {
            // СТРАТЕГІЯ: Якщо Range підтримується
            if (this.isRangeSupported) {
                // --- СТРАТЕГІЯ А: RANGE ЗАПИТИ (З ПІДТРИМКОЮ ПАУЗИ) ---
                if (this.config.chunkSize) {
                    this.logger?.info?.('Початок циклічного завантаження чанками', {
                        chunkSize: this.config.chunkSize,
                    })
                    // ПАРАЛЕЛЬНЕ/ПОШМАТКОВЕ ЗАВАНТАЖЕННЯ (RANGE)
                    while (downloadedBytes < totalSize) {
                        // ПЕРЕВІРКА НА СКАСУВАННЯ
                        if (this.isAborted) throw new Error('Download Aborted')

                        // ПЕРЕВІРКА НА ПАУЗУ (Очікування)
                        if (this.isPaused) {
                            await new Promise((resolve) => {
                                const checkItvId = setInterval(() => {
                                    if (!this.isPaused || this.isAborted) {
                                        clearInterval(checkItvId)
                                        resolve()
                                    }
                                }, 500) // Перевіряємо стан кожні 0.5 сек
                            })
                            if (this.isAborted) continue
                        }

                        const chunkStartTime = Date.now()
                        const amount = Math.min(this.config.chunkSize, totalSize - downloadedBytes)

                        // Виклик клієнта (Base -> Parallel -> Retry)
                        const chunk = await this.client.fetchChunk(
                            this.config.url,
                            this.config.headers,
                            downloadedBytes,
                            amount,
                        )

                        const chunkDuration = (Date.now() - chunkStartTime) / 1000
                        this._updateSpeedHistory(chunk.length, chunkDuration)

                        // Оновлюємо хеш та файл
                        hash.update(chunk)
                        if (fileStream) fileStream.write(chunk)

                        downloadedBytes += chunk.length

                        const metrics = this._calculateMetrics(
                            downloadedBytes,
                            totalSize,
                            startTime,
                        )

                        // Емітимо подію прогресу для зовнішніх споживачів
                        this.emit('progress', metrics)
                    }
                }
                // Випадок Б: chunkSize === null (Stream від офсету до кінця)
                else {
                    this.logger?.info?.('Початок потокового Range завантаження (chunkSize: null)')
                    const response = await fetch(this.config.url, {
                        headers: { ...this.config.headers, Range: `bytes=${downloadedBytes}-` },
                    })

                    if (!response.ok) {
                        throw new Error(
                            `Stream Error (Range): HTTP ${response.status} ${response.statusText}`,
                        )
                    }

                    const reader = response.body.getReader()

                    await this._readFromReader(reader, hash, fileStream, (len) => {
                        downloadedBytes += len

                        const metrics = this._calculateMetrics(
                            downloadedBytes,
                            totalSize,
                            startTime,
                        )

                        // Емітимо подію прогресу для зовнішніх споживачів
                        this.emit('progress', metrics)
                    })
                }
            } else {
                // --- СТРАТЕГІЯ Б: ПОВНИЙ СТРІМ (FALLBACK ЗА ОДИН ЗАПИТ) - (No Range) ---
                this.logger?.info?.('Початок повного потокового завантаження (Fallback)')
                const response = await fetch(this.config.url, { headers: this.config.headers })

                if (!response.ok) {
                    throw new Error(
                        `Full Stream Error (No Range): HTTP ${response.status} ${response.statusText}`,
                    )
                }

                const reader = response.body.getReader()

                await this._readFromReader(reader, hash, fileStream, (len) => {
                    downloadedBytes += len

                    const metrics = this._calculateMetrics(downloadedBytes, totalSize, startTime)

                    // Емітимо подію прогресу для зовнішніх споживачів
                    this.emit('progress', metrics)
                })
            }
        } finally {
            this.isFinished = true
            if (fileStream) {
                fileStream.end()
                // Чекаємо поки ОС фізично запише дані на диск
                await new Promise((resolve) => fileStream.on('finish', resolve))
            }
        }

        // 4. Фіналізація та звіт
        const finalHash = hash.digest('hex')
        const durationSec = ((Date.now() - startTime) / 1000).toFixed(2)

        const summary = {
            status: 'success',
            path: noFile ? null : finalPath,
            fileName,
            sizeMB: (totalSize / 1048576).toFixed(2),
            durationSec,
            avgSpeedMBps: (totalSize / 1048576 / (durationSec || 1)).toFixed(2),
            retriesCaught: this.client.errorCount || 0,
            hashes: { expected: expectedHash || 'N/A', actual: finalHash },
            isRangeSupported: this.isRangeSupported,
        }

        this.logger?.info?.('Завантаження завершено, перевірка хешу', { fileName, finalHash })
        this.emit('finish', summary)

        if (expectedHash && finalHash.toLowerCase() !== expectedHash.toLowerCase()) {
            if (this.isRangeSupported && resume) {
                this.storage.cleanup(tempPath)
            }
            throw new Error(`Hash mismatch! Очікували: ${expectedHash}, отримали: ${finalHash}`)
        }

        if (!noFile) {
            this.storage.moveToFinal(tempPath, finalPath)
        }
    }

    /** Допоміжний метод для читання з ReadableStreamDefaultReader */
    async _readFromReader(reader, hash, fileStream, onChunk) {
        try {
            while (true) {
                if (this.isAborted) {
                    await reader.cancel()
                    break
                }
                const { done, value } = await reader.read()
                if (done) break

                const chunk = Buffer.from(value)
                hash.update(chunk)
                if (fileStream) fileStream.write(chunk)

                onChunk(chunk.length)
            }
        } finally {
            reader.releaseLock()
        }
    }

    _updateSpeedHistory(bytes, seconds) {
        this.speedHistory.push({ bytes, seconds })
        if (this.speedHistory.length > this.config.speedWindowSize) this.speedHistory.shift()
    }

    _calculateMetrics(downloaded, total, startTime) {
        const now = Date.now()
        const elapsedSec = (now - startTime) / 1000 || 0.001
        const windowBytes = this.speedHistory.reduce((a, b) => a + b.bytes, 0)
        const windowSec = this.speedHistory.reduce((a, b) => a + b.seconds, 0) || 0.001

        const instantMBps = windowBytes / 1024 / 1024 / windowSec
        const currentMB = downloaded / 1024 / 1024
        const totalMB = total / 1024 / 1024

        return {
            percent: ((downloaded / total) * 100).toFixed(4),
            mbPerSec: instantMBps.toFixed(4),
            currentMB: currentMB.toFixed(4),
            totalMB: totalMB.toFixed(4),
            elapsedSec: elapsedSec.toFixed(4),
            remainingSec: instantMBps > 0 ? ((totalMB - currentMB) / instantMBps).toFixed(0) : '∞',
            isPaused: this.isPaused,
        }
    }

    _parseFilename(headers, fallback) {
        const disposition = headers.get('content-disposition')
        if (disposition?.includes('filename=')) {
            const match = disposition.match(/filename="?([^"]+)"?/)
            if (match) return decodeURIComponent(match[1])
        }
        return fallback
    }

    _report(m) {
        process.stdout.write(
            `\r📥 [${m.percent}%] | ` +
                `⚡ ${m.mbPerSec} MB/s | ` +
                `📦 ${m.currentMB}/${m.totalMB} MB | ` +
                `⏳ ${m.elapsedSec}s (залишилось ~${m.remainingSec}s)    `,
        )

        this.logger?.info?.(
            `🚀 Режим: ${this.isRangeSupported ? '✅ Range' : '⚠️ Full Stream (No Range)'}`,
        )
        this.logger?.info?.(
            `Метадані: ${fileName} | Розмір: ${(totalSize / 1048576).toFixed(2)} MB`,
        )
        this.logger?.info?.(`🔍 Перевірка цілісності ${fileName}...`)
        this.logger?.info?.(`✅ Файл вже завантажений та перевірений: ${hash}`)
        this.logger?.warn?.('❌ Хеш не збігся. Файл буде перезавантажено.')
        this.logger?.info?.(`📡 Докачування з ${downloadedBytes} байт...`)
        this.logger?.warn?.(
            `🗑️ Спроба докачування була невдалою. Видаляємо пошкоджений темп-файл. ${tempPath}`,
        )
        throw new Error(
            `Hash mismatch! Expected ${expectedHash.toLowerCase()}, got ${finalHash.toLowerCase()}`,
        )
    }
}
