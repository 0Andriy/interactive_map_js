// RetryClientDecorator.js
import { HttpClient } from './HttpClient.js'

export class RetryClientDecorator extends HttpClient {
    constructor(baseClient, retryOptions = {}) {
        super()

        if (!baseClient || typeof baseClient.request !== 'function') {
            throw new Error('[RetryClientDecorator] Base client is missing or invalid')
        }

        this.client = baseClient

        // Дефолтні значення клієнта
        this.defaultRetries = retryOptions.retries ?? 3
        this.defaultDelay = retryOptions.delay ?? 1000
        this.defaultExponential = retryOptions.exponential ?? true
    }

    async request(endpoint, options = {}) {
        // 1. Пріоритет налаштувань: конкретний запит (options.retry) -> дефолтні з конструктора
        const retriesConfig = options.retry || {}
        const maxRetries = retriesConfig.retries ?? this.defaultRetries
        const startDelay = retriesConfig.delay ?? this.defaultDelay
        const isExponential = retriesConfig.exponential ?? this.defaultExponential

        let lastError = null
        let currentDelay = startDelay

        // Загальна кількість спроб = 1 (початкова) + кількість повторів
        const totalAttempts = 1 + Math.max(0, maxRetries)

        for (let i = 0; i < totalAttempts; i++) {
            try {
                // Створюємо повністю ізольований конфіг для поточної спроби запиту
                const currentOptions = {
                    ...options,
                    headers: options.headers ? { ...options.headers } : {},
                }

                // Якщо це ПОВТОРНА спроба, видаляємо використаний signal, що вже міг заабортитися
                if (i > 0 && currentOptions.signal) {
                    delete currentOptions.signal
                }

                // Додаємо заголовок з номером поточної спроби
                currentOptions.headers['X-Retry-Attempt'] = String(i + 1)

                const response = await this.client.request(endpoint, currentOptions)

                // Якщо відповідь успішна або це клієнтська помилка (4xx), повторювати не потрібно
                if (response && (response.ok || response.status < 500)) {
                    return response
                }

                // Якщо це 5xx помилка сервера, фіксуємо її та йдемо на наступне коло
                lastError = new Error(`[Retry] Server responded with status: ${response?.status}`)
            } catch (err) {
                // Якщо запит скасовано користувачем вручну через AbortController — не повторюємо!
                if (err.name === 'AbortError') throw err
                lastError = err
            }

            // Пауза перед наступною спробою (на останньому колі чекати не потрібно)
            if (i < totalAttempts - 1) {
                // Використовуємо умовне логування у тестах, щоб не засмічувати термінал
                if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
                    console.warn(
                        `[Retry] Спроба ${i + 1} невдала. Наступна через ${currentDelay}мс...`,
                    )
                }

                await new Promise((resolve) => setTimeout(resolve, currentDelay))

                if (isExponential) {
                    currentDelay *= 2
                }
            }
        }

        // Якщо всі спроби вичерпано, викидаємо останню помилку
        throw lastError
    }
}
