// FetchClient.js
import { HttpClient } from './HttpClient.js'

export class FetchClient extends HttpClient {
    constructor(config = {}) {
        super()

        if (typeof config !== 'object' || config === null) {
            throw new TypeError('[FetchClient] Config must be an object')
        }

        const base = config.apiBase || ''
        this.apiBase = base.endsWith('/') ? base.slice(0, -1) : base
        this.defaultHeaders = config.defaultHeaders || {}

        // Стандартний формат масивів у URL: 'repeat' (?tags=1&tags=2), 'brackets' (?tags[]=1) або 'comma' (?tags=1,2)
        this.arrayFormat = config.arrayFormat || 'repeat'

        // Інтерцептори передаються через конфіг (DI)
        this.requestInterceptors = Array.isArray(config.requestInterceptors)
            ? config.requestInterceptors
            : []

        this.responseInterceptors = Array.isArray(config.responseInterceptors)
            ? config.responseInterceptors
            : []
    }

    /**
     * Внутрішній безпечний метод для побудови Query String із захистом від спецсимволів
     * @private
     */
    _buildQueryString(params, arrayFormat = 'repeat') {
        // формати: 'repeat', 'brackets', 'comma'
        if (!params || typeof params !== 'object') return ''

        const searchParams = new URLSearchParams()

        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
                // Якщо значення — масив, обробляємо його згідно з обраним форматом
                if (Array.isArray(value)) {
                    if (arrayFormat === 'brackets') {
                        // Формат: tags[]=sale&tags[]=new
                        value.forEach((val) => searchParams.append(`${key}[]`, val))
                    } else if (arrayFormat === 'comma') {
                        // Формат: tags=sale,new
                        searchParams.append(key, value.join(','))
                    } else {
                        // Стандартний формат: tags=sale&tags=new
                        value.forEach((val) => searchParams.append(key, val))
                    }
                } else {
                    searchParams.append(key, value)
                }
            }
        }

        const queryString = searchParams.toString()
        return queryString ? `${queryString}` : ''
    }

    /**
     * Головний метод для виконання будь-яких HTTP-запитів
     */
    async request(endpoint, options = {}) {
        if (typeof endpoint !== 'string') {
            throw new TypeError('[FetchClient] Endpoint must be a string')
        }

        if (typeof options !== 'object' || options === null) {
            throw new TypeError('[FetchClient] Options must be an object')
        }

        // Перетворення заголовків у чистий об'єкт для безпечного об'єднання
        const inputHeaders =
            options.headers instanceof Headers
                ? Object.fromEntries(options.headers.entries())
                : options.headers || {}

        let combinedOptions = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...this.defaultHeaders,
                ...options.headers,
                ...inputHeaders,
            },
        }

        const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
        let url = endpoint.startsWith('http') ? endpoint : `${this.apiBase}${path}`

        // --- Робота з Query Parameters та захист ---
        const queryParams = options.params || options.query
        const currentArrayFormat = options.arrayFormat || this.arrayFormat
        const queryString = this._buildQueryString(queryParams, currentArrayFormat)

        if (queryString) {
            // Захист від зламаного URL: перевіряємо, чи в ендпоінті вже є знак '?'
            const separator = url.includes('?') ? '&' : '?'
            url = `${url}${separator}${queryString}`
        }

        // Авто-серіалізація об'єктів у JSON рядок
        if (
            combinedOptions.body &&
            typeof combinedOptions.body === 'object' &&
            !(combinedOptions.body instanceof FormData)
        ) {
            try {
                combinedOptions.body = JSON.stringify(combinedOptions.body)
            } catch (err) {
                throw new Error('[FetchClient] Failed to serialize request body to JSON', {
                    cause: err,
                })
            }
        }

        // 1. Застосування перехоплювачів ЗАПИТУ (Request Interceptors)
        for (const interceptor of this.requestInterceptors) {
            if (typeof interceptor === 'function') {
                const result = await interceptor(url, combinedOptions)
                if (result && typeof result === 'object') {
                    url = result.url || url
                    combinedOptions = result.options || combinedOptions
                }
            }
        }

        // 2. Очищення нестандартних полів перед фінальним fetch
        const {
            responseType,
            customCache,
            skipAuth,
            timeout,
            retry,
            params,
            query,
            arrayFormat,
            ...nativeFetchOptions
        } = combinedOptions

        // Запит
        let response = await fetch(url, nativeFetchOptions)

        // 3. Застосування перехоплювачів ВІДПОВІДІ (Response Interceptors)
        for (const interceptor of this.responseInterceptors) {
            if (typeof interceptor === 'function') {
                response = await interceptor(response.clone(), url, combinedOptions)
            }
        }

        // // --- ОБРОБКА НЕВДАЛОЇ ВІДПОВІДІ (СТАТУСИ 4xx та 5xx) ---
        // if (!response.ok) {
        //     let errorData = null

        //     // Намагаємося прочитати опис помилки від сервера
        //     try {
        //         errorData = await response.json()
        //     } catch {
        //         try {
        //             errorData = await response.text()
        //         } catch {
        //             errorData = 'Unknown error body'
        //         }
        //     }

        //     // Викидаємо стандартну помилку, додаючи деталі в об'єкт
        //     const error = new Error(`[FetchClient] Request failed with status ${response.status}`)
        //     error.status = response.status
        //     error.statusText = response.statusText
        //     error.response = response
        //     error.data = errorData
        //     throw error
        // }

        // Повертаємо чистий Response для декораторів
        return response
    }
}
