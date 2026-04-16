import { EventEmitter } from 'events'
import { PassThrough } from 'stream'

import { createHash } from 'crypto'
import { createWriteStream } from 'fs'
import { mkdir, rename, unlink } from 'fs/promises'
import { dirname, join } from 'path'
import { pipeline } from 'stream/promises'

/**
 * Універсальний HTTP клієнт з Circuit Breaker та Smart Resume.
 */
export class ApiClient extends EventEmitter {
    constructor(baseUrl, authManager, logger = null) {
        super()
        this.baseUrl = baseUrl
        this.authManager = authManager
        this.logger = logger?.child?.({ context: 'ApiClient' }) ?? logger

        // Налаштування Circuit Breaker
        this.failureThreshold = 5 // Кількість помилок для відкриття
        this.resetTimeout = 30000 // Час очікування (30с) перед пробним запитом
        this.failures = 0
        this.nextAttempt = 0
        this.state = 'CLOSED' // CLOSED, OPEN, HALF_OPEN
    }

    /** Низькорівневий базовий метод для всіх типів запитів */
    async _baseRequest(endpoint, options = {}, retry = 0) {
        this._checkCircuitBreaker()

        const requestId = options.requestId || Math.random().toString(36).substring(7)
        const log = this.logger?.child?.({ requestId, endpoint }) ?? this.logger
        const token = await this.authManager.getAccessToken()
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`

        const config = {
            ...options,
            headers: {
                ...(token && { Authorization: `Bearer ${token}` }),
                ...options.headers,
            },
        }

        try {
            const response = await fetch(url, config)

            if (res.ok || res.status === 206) {
                this._onSuccess()
                return response
            }

            if (res.status === 401 && retry < 1) {
                log?.warn?.('401 - оновлення токена')
                await this.authManager.refresh()
                return this._baseRequest(endpoint, options, retry + 1)
            }

            return await this._handleErrorResponse(response, requestId)

            // if (response.status === 401 && retry < 1) {
            //     log?.warn?.('401 - оновлення токена...')
            //     await this.authManager.refresh()
            //     return await this._baseRequest(endpoint, options, retry + 1)
            // }

            // if (!response.ok && response.status !== 206) {
            //     const errorData = await response.json().catch(() => ({}))
            //     throw { status: response.status, data: errorData, requestId }
            // }

            // return response
        } catch (error) {
            this._handleNetworkError(error)
            throw error
        }
    }

    _checkCircuitBreaker() {
        if (this.state === 'OPEN') {
            if (Date.now() > this.nextAttempt) {
                this.state = 'HALF_OPEN'
            } else {
                throw new Error(
                    `Circuit Breaker OPEN. Try after ${new Date(this.nextAttempt).toISOString()}`,
                )
            }
        }
    }

    _onSuccess() {
        this.failures = 0
        this.state = 'CLOSED'
    }

    _onFailure() {
        this.failures++
        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN'
            this.nextAttempt = Date.now() + this.resetTimeout
            this.logger?.error?.('CIRCUIT BREAKER OPENED')
        }
    }

    async _handleErrorResponse(res, requestId) {
        if (res.status >= 500) this._onFailure()

        const errorData = await res.json().catch(() => ({}))
        throw { status: res.status, data: errorData, requestId }
    }

    _handleNetworkError(err) {
        if (err.name !== 'AbortError') this._onFailure()
    }

    /** Повертає JSON дані */
    async request(endpoint, options = {}) {
        const res = await this._baseRequest(endpoint, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers },
            body:
                options.body && typeof options.body === 'object'
                    ? JSON.stringify(options.body)
                    : options.body,
        })
        return res.json()
    }

    /**
     * Повертає потік (Readable Stream) назовні
     * Потік з підтримкою дозавантаження (Range) при розриві
     */
    async streamRequest(endpoint, options = {}, downloadedOffset = 0) {
        const requestId = options.requestId || Math.random().toString(36).substring(7)
        const passThrough = new PassThrough()

        // Створюємо проміс для отримання першого Response об'єкта
        let resolveFirstResponse
        const firstResponsePromise = new Promise((res) => {
            resolveFirstResponse = res
        })

        const startStream = async (offset) => {
            try {
                const reqOptions = { ...options }

                // Якщо ми дозавантажуємо, додаємо Range заголовок
                if (offset > 0) {
                    reqOptions.headers = { ...reqOptions.headers, Range: `bytes=${offset}-` }
                }

                const res = await this._baseRequest(endpoint, reqOptions)

                // Перевірка підтримки Range сервером при першому запиті з оффсетом
                if (offset > 0 && res.status !== 206) {
                    this.logger?.error?.('Сервер не підтримує дозавантаження (Range не прийнято)')
                    throw new Error('Server does not support partial content')
                }

                // Передаємо response назовні тільки ОДИН раз (початкові мета-дані)
                if (offset === downloadedOffset) resolveFirstResponse(res)

                const reader = res.body.getReader()
                // Загальний розмір = залишок від сервера + те, що вже скачали
                const totalSize = parseInt(res.headers.get('content-length') || '0', 10) + offset
                const startTime = Date.now()

                let currentDownloaded = offset

                while (true) {
                    try {
                        const { done, value } = await reader.read()
                        if (done) {
                            passThrough.end()
                            break
                        }

                        const chunk = Buffer.from(value)
                        currentDownloaded += chunk.length

                        // Емітимо подію для зовнішніх лісенерів
                        this.emit('data', { requestId, endpoint, chunk })

                        this._emitProgress(
                            requestId,
                            endpoint,
                            currentDownloaded,
                            totalSize,
                            startTime,
                        )

                        if (!passThrough.write(chunk)) {
                            await new Promise((r) => passThrough.once('drain', r))
                        }
                    } catch (streamErr) {
                        // Якщо стрім обірвався - пробуємо докачати з місця обриву
                        this.logger?.warn?.('Stream interrupted, resuming...', {
                            offset: currentDownloaded,
                            error: streamErr.message,
                        })

                        // Рекурсивно перепідключаємося з місця розриву
                        return startStream(currentDownloaded)
                    }
                }
            } catch (err) {
                passThrough.destroy(err)
            }
        }

        // Запускаємо процес
        startStream(downloadedOffset)

        // Чекаємо на перший response, щоб повернути його разом зі стрімом
        const response = await firstResponsePromise

        return { stream: passThrough, response: response }
    }

    /**
     * Завантажує файл, розраховує хеш "на льоту" та порівнює його з очікуваним.
     * @param {string} endpoint - Шлях до файлу.
     * @param {string} destPath - Шлях для збереження.
     * @param {Object} options - Опції (алгоритм хешування, очікуваний хеш).
     */
    async downloadWithVerify(endpoint, destPath, { algo = 'sha256', expectedHash = null } = {}) {
        const { stream, response } = await this.streamRequest(endpoint)
        const hash = createHash(algo)
        const writer = createWriteStream(destPath)

        // Якщо хеш не передано явно, спробуємо знайти його в заголовках сервера
        const finalExpectedHash =
            expectedHash ||
            response.headers.get('x-checksum') ||
            response.headers.get('etag')?.replace(/"/g, '')

        this.logger?.info?.('Початок завантаження з валідацією', {
            endpoint,
            algo,
            expectedHash: finalExpectedHash,
            destPath,
        })

        try {
            await pipelinePromise(
                stream,
                async function* (source) {
                    for await (const chunk of source) {
                        hash.update(chunk) // Оновлюємо хеш для кожного шматка даних
                        yield chunk
                    }
                },
                writer,
            )

            const actualHash = hash.digest('hex')
            const isValid =
                !finalExpectedHash || actualHash.toLowerCase() === finalExpectedHash.toLowerCase()

            if (!isValid) {
                throw new Error(
                    `Hash mismatch! Expected: ${finalExpectedHash}, Actual: ${actualHash}`,
                )
            }

            this.logger?.info?.('Файл успішно верифіковано', { endpoint, actualHash })
            return { destPath, actualHash, response }
        } catch (error) {
            this.logger?.error?.('Помилка цілісності або завантаження', { msg: error.message })
            throw error
        }
    }

    /**
     * Атомарне завантаження з верифікацією хешу.
     */
    async downloadWithVerify2(endpoint, destPath, { algo = 'sha256', expectedHash = null } = {}) {
        const requestId = Math.random().toString(36).substring(7)
        const log = this.logger?.child?.({ requestId, endpoint })

        // Створюємо шлях до тимчасового файлу
        const tempPath = `${destPath}.${requestId}.part`

        try {
            // 1. Створюємо папку, якщо її немає
            await mkdir(dirname(destPath), { recursive: true })

            // 2. Отримуємо стрім (наш streamRequest уже підтримує Resume/Range)
            const { stream, response } = await this.streamRequest(endpoint)

            const hash = createHash(algo)
            const writer = createWriteStream(tempPath, { flags: 'a' }) // 'a' для дозапису (Resume)

            // Визначаємо очікуваний хеш
            const finalExpectedHash =
                expectedHash ||
                response.headers.get('x-checksum') ||
                response.headers.get('etag')?.replace(/"/g, '')

            log?.info?.('Початок атомарного завантаження', { tempPath })

            // 3. Виконуємо pipeline (запис + хешування на льоту)
            await pipeline(
                stream,
                async function* (source) {
                    for await (const chunk of source) {
                        hash.update(chunk)
                        yield chunk
                    }
                },
                writer,
            )

            // 4. Перевірка хешу
            const actualHash = hash.digest('hex')
            const isValid =
                !finalExpectedHash || actualHash.toLowerCase() === finalExpectedHash.toLowerCase()

            if (!isValid) {
                throw new Error(
                    `Hash mismatch! Expected: ${finalExpectedHash}, Actual: ${actualHash}`,
                )
            }

            // 5. АТОМАРНА ОПЕРАЦІЯ: Перейменування лише після успішної перевірки
            await rename(tempPath, destPath)

            log?.info?.('Файл успішно завантажено та верифіковано', { destPath })
            return { destPath, actualHash, response }
        } catch (error) {
            log?.error?.('Завантаження провалено. Очищення тимчасових файлів...', {
                error: error.message,
            })

            // Видаляємо тимчасовий файл у разі критичної помилки (наприклад, помилка хешу)
            // Якщо це помилка мережі, і ми хочемо зберегти .part для Resume,
            // логіку unlink можна зробити вибірковою.
            if (error.message.includes('Hash mismatch')) {
                await unlink(tempPath).catch(() => {})
            }

            throw error
        }
    }

    _emitProgress(requestId, endpoint, downloaded, totalSize, startTime) {
        const now = Date.now()
        const duration = (now - startTime) / 1000
        const speed = downloaded / duration
        const eta = speed > 0 ? Math.round((totalSize - downloaded) / speed) : 0
        const persent = totalSize ? Math.round((downloaded / totalSize) * 100) : 0

        this.emit('progress', {
            requestId,
            endpoint,
            downloaded,
            totalSize,
            speed,
            eta,
            percent: persent,
        })
    }
}
