import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export class BlobDownloader extends EventEmitter {
    constructor({ client, storage, logger, config }) {
        super()
        this.client = client
        this.storage = storage
        this.logger = logger?.child?.({ component: 'Downloader' }) || logger
        this.config = {
            defaultFileName: 'video.mp4',
            chunkSize: 2 * 1024 * 1024,
            speedWindowSize: 10,
            ...config,
        }

        this.state = {
            isPaused: false,
            isAborted: false,
            isFinished: false,
            isRangeSupported: false,
        }
        this.speedHistory = []
    }

    // --- Керування станом ---
    pause() {
        if (!this.state.isFinished && this.state.isRangeSupported) {
            this.state.isPaused = true
            this.emit('paused')
        }
    }
    resumeDownload() {
        this.state.isPaused = false
        this.emit('resumed')
    }
    abort() {
        this.state.isAborted = true
        this.state.isPaused = false
        this.emit('aborted')
    }

    /**
     * ГОЛОВНИЙ ОРКЕСТРАТОР (SRP)
     */
    async download(options = {}) {
        this.state.isFinished = false
        this.state.isAborted = false

        try {
            // 1. Підготовка метаданих
            const meta = await this._prepareMetadata(options)
            if (meta.skip) return

            // 2. Ініціалізація ресурсів
            const hash = crypto.createHash('sha256')
            if (meta.resumeOffset > 0) await this.storage.updateHashFromFile(meta.tempPath, hash)

            const fileStream = options.noFile
                ? null
                : fs.createWriteStream(meta.tempPath, { flags: 'a' })
            const startTime = Date.now()

            // 3. Виконання завантаження (Strategy Pattern)
            const strategy = this._selectStrategy(meta)
            await strategy.call(this, meta, hash, fileStream, startTime)

            // 4. Фіналізація
            await this._finalize(meta, hash, fileStream, startTime)
        } catch (err) {
            this.state.isFinished = true
            this.emit('error', err)
            throw err
        }
    }

    // --- Приватні методи-кроки (DRY) ---

    async _prepareMetadata(options) {
        const probe = await fetch(this.config.url, {
            headers: { ...this.config.headers, Range: 'bytes=0-0' },
        })
        if (!probe.ok) throw new Error(`Probe HTTP ${probe.status}`)

        this.state.isRangeSupported = probe.status === 206
        const totalSize = this.state.isRangeSupported
            ? parseInt(probe.headers.get('content-range')?.split('/')[1], 10)
            : parseInt(probe.headers.get('content-length'), 10)

        const fileName = this._parseFilename(probe.headers)
        const finalPath = path.join(this.storage.directory, fileName)
        const tempPath = finalPath + '.tmp'
        const expectedHash = probe.headers.get('x-sha256')?.toLowerCase()

        if (options.fresh) {
            this.storage.cleanup(finalPath)
            this.storage.cleanup(tempPath)
        }

        // Перевірка цілісності існуючого
        if (!options.fresh && fs.existsSync(finalPath)) {
            const hash = await this.storage.getFileHash(finalPath)
            if (hash === expectedHash) {
                this.emit('finish', { status: 'exists', fileName })
                return { skip: true }
            }
            this.storage.cleanup(finalPath)
        }

        const stats = this.storage.getFileStats(tempPath)
        return {
            totalSize,
            expectedHash,
            fileName,
            finalPath,
            tempPath,
            resumeOffset: this.state.isRangeSupported && !options.fresh && stats ? stats.size : 0,
        }
    }

    _selectStrategy(meta) {
        if (this.state.isRangeSupported) {
            return this.config.chunkSize ? this._rangeStrategy : this._singleRangeStreamStrategy
        }
        return this._fullStreamStrategy
    }

    async _rangeStrategy(meta, hash, fileStream, startTime) {
        let current = meta.resumeOffset
        while (current < meta.totalSize) {
            await this._waitIfPaused()
            if (this.state.isAborted) throw new Error('Aborted')

            const start = Date.now()
            const amount = Math.min(this.config.chunkSize, meta.totalSize - current)
            const chunk = await this.client.fetchChunk(
                this.config.url,
                this.config.headers,
                current,
                amount,
            )

            this._writeChunk(chunk, hash, fileStream)
            this._updateStats(chunk.length, (Date.now() - start) / 1000)

            current += chunk.length
            this.emit('progress', this._calculateMetrics(current, meta.totalSize, startTime))
        }
    }

    async _singleRangeStreamStrategy(meta, hash, fileStream, startTime) {
        const res = await fetch(this.config.url, {
            headers: { ...this.config.headers, Range: `bytes=${meta.resumeOffset}-` },
        })
        await this._readFromReader(res.body.getReader(), meta, hash, fileStream, startTime)
    }

    async _fullStreamStrategy(meta, hash, fileStream, startTime) {
        const res = await fetch(this.config.url, { headers: this.config.headers })
        await this._readFromReader(res.body.getReader(), meta, hash, fileStream, startTime)
    }

    async _readFromReader(reader, meta, hash, fileStream, startTime) {
        let current = meta.resumeOffset
        try {
            while (true) {
                if (this.state.isAborted) {
                    await reader.cancel()
                    break
                }
                const { done, value } = await reader.read()
                if (done) break

                const chunk = Buffer.from(value)
                this._writeChunk(chunk, hash, fileStream)
                current += chunk.length
                this.emit('progress', this._calculateMetrics(current, meta.totalSize, startTime))
            }
        } finally {
            reader.releaseLock()
        }
    }

    _writeChunk(chunk, hash, fileStream) {
        hash.update(chunk)
        if (fileStream) fileStream.write(chunk)
    }

    async _finalize(meta, hash, fileStream, startTime) {
        this.state.isFinished = true
        if (fileStream) {
            fileStream.end()
            await new Promise((r) => fileStream.on('finish', r))
        }

        const finalHash = hash.digest('hex')
        const summary = {
            fileName: meta.fileName,
            hashes: { expected: meta.expectedHash, actual: finalHash },
            duration: ((Date.now() - startTime) / 1000).toFixed(2),
        }

        if (meta.expectedHash && finalHash !== meta.expectedHash) {
            this.storage.cleanup(meta.tempPath)
            throw new Error(`Hash mismatch! ${finalHash} != ${meta.expectedHash}`)
        }

        if (fileStream) this.storage.moveToFinal(meta.tempPath, meta.finalPath)
        this.emit('finish', summary)
    }

    async _waitIfPaused() {
        if (!this.state.isPaused) return
        return new Promise((res) => {
            const itv = setInterval(() => {
                if (!this.state.isPaused || this.state.isAborted) {
                    clearInterval(itv)
                    res()
                }
            }, 200)
        })
    }

    _parseFilename(h) {
        const d = h.get('content-disposition')
        if (d?.includes('filename=')) return decodeURIComponent(d.match(/filename="?([^"]+)"?/)[1])
        return this.config.defaultFileName
    }

    _updateStats(b, s) {
        this.speedHistory.push({ b, s })
        if (this.speedHistory.length > this.config.speedWindowSize) this.speedHistory.shift()
    }

    _calculateMetrics(d, t, s) {
        const elap = (Date.now() - s) / 1000 || 0.1
        const winB = this.speedHistory.reduce((a, c) => a + c.b, 0)
        const winS = this.speedHistory.reduce((a, c) => a + c.s, 0) || 0.1
        const speed = winB / 1048576 / winS
        return {
            percent: ((d / t) * 100).toFixed(1),
            mbPerSec: speed.toFixed(2),
            currentMB: (d / 1048576).toFixed(2),
            totalMB: (t / 1048576).toFixed(2),
            isPaused: this.state.isPaused,
            elapsedSec: elap.toFixed(1),
            remainingSec: speed > 0 ? ((t - d) / 1048576 / speed).toFixed(0) : '∞',
        }
    }
}
