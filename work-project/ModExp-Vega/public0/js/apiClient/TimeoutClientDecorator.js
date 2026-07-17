// TimeoutClientDecorator.js
import { HttpClient } from './HttpClient.js'

export class TimeoutClientDecorator extends HttpClient {
    constructor(baseClient, defaultTimeout = 5000) {
        super()

        if (!baseClient || typeof baseClient.request !== 'function') {
            throw new Error('[TimeoutClientDecorator] Base client is missing or invalid')
        }

        this.client = baseClient
        this.defaultTimeout = defaultTimeout
    }

    async request(endpoint, options = {}) {
        // Якщо таймаут явно вимкнено або дорівнює 0, просто виконуємо запит без змін
        if (options.timeout === 0 || options.timeout === false) {
            return this.client.request(endpoint, options)
        }

        const ms = typeof options.timeout === 'number' ? options.timeout : this.defaultTimeout

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), ms)

        // Якщо користувач передав свій власний сигнал для скасування запиту
        if (options.signal) {
            // Захист: якщо зовнішній сигнал вже скасовано, миттєво скасовуємо наш внутрішній
            if (options.signal.aborted) {
                controller.abort()
            } else {
                options.signal.addEventListener('abort', () => controller.abort())
            }
        }

        const currentOptions = {
            ...options,
            signal: controller.signal,
        }

        try {
            const response = await this.client.request(endpoint, currentOptions)
            clearTimeout(timeoutId)
            return response
        } catch (err) {
            clearTimeout(timeoutId)

            // Якщо запит перервано саме нашим таймаутом (а не зовнішнім сигналом користувача)
            if (err.name === 'AbortError' && (!options.signal || !options.signal.aborted)) {
                throw new Error(`[Timeout] Request to ${endpoint} exceeded ${ms}ms`)
            }
            throw err
        }
    }
}
