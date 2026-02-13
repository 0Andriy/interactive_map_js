import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { createHash } from 'crypto'

/**
 * Універсальний HTTP клієнт з підтримкою авторизації та завантаження файлів.
 */
export class ApiClient extends EventEmitter {
    /**
     * @param {string} baseUrl - Базовий URL API.
     * @param {AuthManager} authManager - Менеджер авторизації.
     * @param {Logger} [logger] - Логер.
     */
    constructor(baseUrl, authManager, logger = null) {
        super()
        this.baseUrl = baseUrl
        this.authManager = authManager
        this.logger = logger
    }

    /**
     * Виконує стандартний JSON запит.
     * @param {string} endpoint - Шлях до ресурсу.
     * @param {RequestInit} [options={}] - Опції fetch.
     * @param {number} [retry=0] - Лічильник повторів.
     */
    async request(endpoint, options = {}, retry = 0) {
        const requestId = options.requestId || Math.random().toString(36).substring(7)
        const log = this.logger?.child?.({ requestId, endpoint })
        const token = await this.authManager.getAccessToken()

        const config = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(token && { Authorization: `Bearer ${token}` }),
                ...options.headers,
            },
            body:
                options.body && typeof options.body === 'object'
                    ? JSON.stringify(options.body)
                    : options.body,
        }

        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, config)

            if (response.status === 401 && retry < 1) {
                log?.warn?.('401 Unauthorized - спроба оновлення...')
                await this.authManager.refresh()
                return await this.request(endpoint, options, retry + 1)
            }

            if (!response.ok)
                throw { status: response.status, data: await response.json().catch(() => ({})) }

            return response
        } catch (error) {
            log?.error?.('Запит провалено', { error: error.message || error })
            throw error
        }
    }

    /**
     * Завантажує файл за допомогою стрімів.
     * @param {string} endpoint - Шлях до файлу.
     * @param {string} destPath - Куди зберегти файл.
     * @param {string} [algorithm='sha256'] - Алгоритм хешування (md5, sha1, sha256)
     * @param {number} [retry=0]
     * @returns {Promise<{destPath: string, response: Response, actualHash: string}>}
     */
    async download(endpoint, destPath, algorithm = 'sha256', retry = 0) {
        const requestId = Math.random().toString(36).substring(7)
        const token = await this.authManager.getAccessToken()
        const startTime = Date.now() // Час початку завантаження

        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                headers: { ...(token && { Authorization: `Bearer ${token}` }) },
            })

            if (response.status === 401 && retry < 1) {
                await this.authManager.refresh()
                return await this.download(endpoint, destPath, algorithm, retry + 1)
            }

            if (!response.ok) throw new Error(`HTTP ${response.status}`)

            await mkdir(dirname(destPath), { recursive: true })

            const totalSize = parseInt(response.headers.get('content-length') || '0', 10)

            const writer = createWriteStream(destPath)
            const reader = response.body.getReader()
            const hash = createHash(algorithm) // Ініціалізуємо об'єкт хешу

            let downloaded = 0

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const buffer = Buffer.from(value)

                // ПАРАЛЕЛЬНІ ДІЇ З ЧАНКОМ ДАНИХ:
                writer.write(buffer) // 1. Пишемо на диск
                hash.update(buffer) // 2. Додаємо в розрахунок хешу (в пам'яті)

                // ПІДПИСКА ЗОВНІ: передаємо чанк іншим обробникам
                this.emit('data', { requestId, endpoint, chunk })

                downloaded += buffer.length

                // Розрахунок метрик
                const now = Date.now()
                const durationInSeconds = (now - startTime) / 1000
                const bytesPerSecond = downloaded / durationInSeconds

                // Розрахунок очікуваного часу (ETA)
                const remainingBytes = totalSize - downloaded
                const etaSeconds =
                    bytesPerSecond > 0 ? Math.round(remainingBytes / bytesPerSecond) : 0

                this.emit('progress', {
                    requestId,
                    endpoint,
                    downloaded,
                    totalSize,
                    percent: totalSize ? Math.round((downloaded / totalSize) * 100) : 0,
                    speed: bytesPerSecond, // байт/сек
                    eta: etaSeconds, // сек
                })
            }
            await new Promise((r) => writer.on('finish', r).end())
            const actualHash = hash.digest('hex')

            this.emit('finished', { requestId, endpoint, destPath })

            // ПОВЕРТАЄМО ОБ'ЄКТ З RESPONSE
            return {
                destPath,
                response, // Тут доступні всі заголовки сервера
                actualHash,
            }
        } catch (error) {
            this.emit('error', { requestId, endpoint, error: error.message })
            throw error
        }
    }

    /**
     * Робить запит і повертає Node.js Readable Stream.
     * @param {string} endpoint - Шлях до ресурсу.
     * @param {RequestInit} [options={}] - Опції запиту.
     * @param {number} [retry=0] - Лічильник повторів.
     * @returns {Promise<{ stream: Readable, response: Response }>}
     */
    async streamRequest(endpoint, options = {}, retry = 0) {
        const requestId = options.requestId || Math.random().toString(36).substring(7)
        const log = this.logger?.child?.({ requestId, endpoint })
        const token = await this.authManager.getAccessToken()

        const config = {
            ...options,
            headers: {
                ...(token && { Authorization: `Bearer ${token}` }),
                ...options.headers,
            },
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, config)

        // Обробка авторизації
        if (response.status === 401 && retry < 1) {
            log?.warn?.('401 Unauthorized - оновлення сесії...')
            await this.authManager.refresh()
            return this.streamRequest(endpoint, options, retry + 1)
        }

        if (!response.ok) {
            throw { status: response.status, message: 'Stream request failed' }
        }

        // Створюємо міст між Web Stream та Node.js Stream
        const passThrough = new PassThrough()
        const reader = response.body.getReader()
        const totalSize = parseInt(response.headers.get('content-length') || '0', 10)
        let downloaded = 0
        const startTime = Date.now()

        // Асинхронно читаємо Web Stream і штовхаємо в Node.js Stream
        ;(async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) {
                        passThrough.end()
                        break
                    }

                    const chunk = Buffer.from(value)
                    downloaded += chunk.length

                    // Емітимо дані та прогрес для зовнішніх спостерігачів
                    this.emit('data', { requestId, endpoint, chunk })
                    this._emitProgress(requestId, endpoint, downloaded, totalSize, startTime)

                    // Передаємо чанк у потік
                    if (!passThrough.write(chunk)) {
                        // Якщо внутрішній буфер переповнений, чекаємо на 'drain'
                        await new Promise((resolve) => passThrough.once('drain', resolve))
                    }
                }
            } catch (err) {
                log?.error?.('Помилка під час стрімінгу даних', { error: err.message })
                passThrough.destroy(err)
            }
        })()

        return {
            stream: passThrough,
            response,
        }
    }

    /** Внутрішній метод для прогресу */
    _emitProgress(requestId, endpoint, downloaded, totalSize, startTime) {
        const now = Date.now()
        const duration = (now - startTime) / 1000
        const speed = downloaded / duration
        const eta = speed > 0 ? Math.round((totalSize - downloaded) / speed) : 0

        this.emit('progress', {
            requestId,
            endpoint,
            downloaded,
            totalSize,
            speed,
            eta,
            percent: totalSize ? Math.round((downloaded / totalSize) * 100) : 0,
        })
    }
}
