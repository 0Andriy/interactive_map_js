/**
 * Базовий HTTP Клієнт для Range-запитів
 */
export class BaseHttpClient {
    constructor(logger, timeout = 30000) {
        this.logger = logger?.child?.({ component: 'HttpClient' }) || logger
        this.timeout = timeout // Таймаут у мілісекундах
    }

    async fetchChunk(url, headers, offset = 0, length = null) {
        // Формат bytes=offset- (скачати все до кінця) або bytes=offset-end
        const rangeHeader = length ? `bytes=${offset}-${offset + length - 1}` : `bytes=${offset}-`
        const controller = new AbortController()

        const timeoutId = setTimeout(() => {
            this.logger?.error?.('Перевищено таймаут запиту', {
                url,
                offset,
                timeout: this.timeout,
            })
            controller.abort()
        }, this.timeout)

        try {
            this.logger?.debug?.('Надсилання HTTP запиту', { offset, length, rangeHeader })

            const response = await fetch(url, {
                headers: {
                    ...headers,
                    Range: rangeHeader,
                },
                signal: controller.signal,
            })

            if (!response.ok) {
                const errStatus = `HTTP ${response.status} ${response.statusText}`
                this.logger?.error?.('Сервер повернув помилку', { status: errStatus, offset })
                throw new Error(errStatus)
            }

            const arrayBuffer = await response.arrayBuffer()
            const buffer = Buffer.from(arrayBuffer)
            this.logger?.debug?.('Отримано чанк даних', { receivedLength: buffer.length })
            return buffer
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error(`Таймаут з'єднання (${this.timeout}ms)`)
            }
            this.logger?.error?.('Помилка мережевого запиту', { message: err.message, offset })
            throw err
        } finally {
            clearTimeout(timeoutId)
        }
    }
}

/**
 * Декоратор: Адаптивна паралельність (Backoff)
 */
export class AdaptiveParallelClient {
    constructor(client, logger, maxConcurrency = 4) {
        this.client = client
        this.logger = logger?.child?.({ component: 'AdaptiveParallel' }) || logger
        this.maxConcurrency = maxConcurrency
        this.currentConcurrency = maxConcurrency
    }

    async fetchChunk(url, headers, offset, length) {
        // Якщо довжина не вказана, паралельність неможлива (open-ended range)
        if (!length) {
            this.logger?.debug?.('Пропуск паралельності: довжина чанку не вказана', { offset })
            return this.client.fetchChunk(url, headers, offset, null)
        }

        try {
            this.logger?.debug?.('Запуск паралельного завантаження під-чанків', {
                offset,
                totalLength: length,
                concurrency: this.currentConcurrency,
            })

            const result = await this._executeParallel(url, headers, offset, length)

            // Поступове відновлення потужності
            if (this.currentConcurrency < this.maxConcurrency) {
                this.currentConcurrency++
                this.logger?.debug?.('Потужність паралельності відновлюється', {
                    current: this.currentConcurrency,
                })
            }
            return result
        } catch (err) {
            // Різке зниження потужності при помилці (Multiplicative Decrease)
            this.currentConcurrency = Math.max(1, Math.floor(this.currentConcurrency / 2))
            this.logger?.warn?.('Зниження потужності через помилку чанку', {
                error: err.message,
                newConcurrency: this.currentConcurrency,
            })
            throw err
        }
    }

    async _executeParallel(url, headers, offset, length) {
        const subChunkSize = Math.ceil(length / this.currentConcurrency)
        const tasks = []

        for (let i = 0; i < this.currentConcurrency; i++) {
            const subOffset = offset + i * subChunkSize
            const subLength = Math.min(subChunkSize, offset + length - subOffset)

            if (subLength > 0) {
                tasks.push(this.client.fetchChunk(url, headers, subOffset, subLength))
            }
        }

        const results = await Promise.all(tasks)
        return Buffer.concat(results)
    }
}

/**
 * Декоратор: Повторні спроби (Retry) з експоненціальною затримкою
 */
export class RetryHttpClient {
    constructor(client, logger, retries = 3) {
        this.client = client
        this.logger = logger?.child?.({ component: 'RetryHandler' }) || logger
        this.retries = retries
        this.errorCount = 0
    }

    async fetchChunk(url, headers, offset, length) {
        for (let i = 1; i <= this.retries; i++) {
            try {
                return await this.client.fetchChunk(url, headers, offset, length)
            } catch (err) {
                this.errorCount++

                if (i === this.retries) {
                    this.logger?.error?.('Всі спроби завантаження чанку вичерпано', {
                        offset,
                        totalRetries: this.retries,
                    })
                    throw err
                }

                const delay = Math.pow(2, i) * 500
                this.logger?.warn?.('Спроба невдала, готуємо повтор', {
                    attempt: i,
                    nextDelay: delay,
                    error: err.message,
                    offset,
                })

                await new Promise((resolve) => setTimeout(resolve, delay))
            }
        }
    }
}
