// AuthClientDecorator.js
import { HttpClient } from './HttpClient.js'

export class AuthClientDecorator extends HttpClient {
    constructor(baseClient, authConfig) {
        super()

        if (!baseClient || typeof baseClient.request !== 'function') {
            throw new Error('[AuthClientDecorator] Base client is missing or invalid')
        }

        // Впроваджуємо нижній клієнт (DI)
        this.client = baseClient

        // Використовуємо кастомні методи або дефолтні фейлбеки з цього ж класу
        this.getAccessToken =
            typeof authConfig.getAccessToken === 'function' ? authConfig.getAccessToken : null // this._defaultGetAccessToken.bind(this)

        this.refreshTokens =
            typeof authConfig.refreshTokens === 'function' ? authConfig.refreshTokens : null // this._defaultRefreshTokens.bind(this)

        // Єдине сховище для активного процесу оновлення токенів
        this.refreshPromise = null
    }

    async request(endpoint, options = {}) {
        // Створюємо глибоку копію options.headers, щоб не мутувати оригінальні об'єкти
        options.headers = options.headers ? { ...options.headers } : {}

        // ОПТИМІЗАЦІЯ ДЛЯ ПУБЛІЧНИХ ЗАПИТІВ:
        // Якщо передано skipAuth, ми повністю ігноруємо логіку токенів та рефрешу
        if (options.skipAuth) {
            return this.client.request(endpoint, options)
        }

        // Динамічно додаємо токен, якщо він існує
        if (this.getAccessToken && typeof this.getAccessToken === 'function') {
            let token = await this.getAccessToken()

            // КЛІЄНТСЬКА ПЕРЕВІРКА: Якщо токен є, але він ВЖЕ прострочений — відразу рефрешимо
            if (token && this._isJwtExpired(token) && this.refreshTokens) {
                try {
                    token = await this._safeRefreshPipeline()
                } catch (err) {
                    throw err // Сесія померла
                }
            }

            if (token) {
                options.headers['Authorization'] = `Bearer ${token}`
            }
        }

        let response = await this.client.request(endpoint, options)

        // ФОЛБЕК НА СЕРВЕРНУ ПЕРЕВІРКУ - Перехоплюємо 401 статус (якщо годинник клієнта збитий і ми пропустили прострочений токен)
        if (
            response &&
            response.status === 401 &&
            this.refreshTokens &&
            typeof this.refreshTokens === 'function'
        ) {
            // return this._handleUnauthorized(endpoint, options)
            return this._handleUnauthorizedFromServer(endpoint, options)
        }

        return response
    }

    async _handleUnauthorized(endpoint, options) {
        // 1. Якщо рефрешу немає — створюємо його ОДИН раз для всіх
        // Блокування перегонів: якщо рефреш не запущено — створюємо один проміс для всіх
        if (!this.refreshPromise) {
            this.refreshPromise = this.refreshTokens()
                .then((newToken) => {
                    // Коли успішно закінчили — очищаємо посилання
                    // Очищаємо після успіху
                    this.refreshPromise = null
                    return newToken
                })
                .catch((err) => {
                    // Якщо рефреш впав, негайно видаляємо цей зіпсований проміс,
                    // щоб наступні запити могли спробувати знову (наприклад, якщо це був збій мережі)
                    // Очищаємо після помилки, щоб дозволити повторну спробу
                    this.refreshPromise = null
                    throw err
                })
        }

        try {
            // 2. Усі запити (і перший, і паралельні) чекають на ОДИН і ТОЙ САМИЙ проміс
            const newToken = await this.refreshPromise

            // 3. Повторюємо оригінальний запит із новим токеном
            options.headers['Authorization'] = `Bearer ${newToken}`
            return await this.client.request(endpoint, options)
        } catch (err) {
            // Прокидаємо помилку далі у викликаючий код (компонент чи сервіс)
            throw err
        }
    }

    // Дефолтний метод ( fallback )
    async _defaultGetAccessToken() {
        if (typeof localStorage !== 'undefined') {
            const accessToken = localStorage.getItem('accessToken')
            return accessToken
        }

        return null
    }

    // Дефолтний метод ( fallback )
    async _defaultRefreshTokens() {
        if (typeof localStorage === 'undefined') {
            throw new Error('[Auth] Storage is unavailable in this environment')
        }

        const refreshToken = localStorage.getItem('refreshToken')
        if (!refreshToken) {
            this._handleAuthFailure(null)
            throw new Error('[Auth] Refresh token is missing in storage')
        }

        const apiBase = (typeof window !== 'undefined' && window.APP_CONFIG?.API_BASE) || ''

        let response
        try {
            response = await fetch(`${apiBase}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
            })
        } catch (networkError) {
            // Мережа зникла, сервер лежить або CORs помилка. Сховище НЕ ЧИСТИМО.
            // Користувач залишається залогіненим, просто цей конкретний запит впаде.
            throw new Error('[Auth] Network error during token refresh. Retrying later.')
        }

        // Якщо сервер відповів, але статус не OK
        if (!response.ok) {
            // Розлогінюємо тільки якщо сервер явно сказав, що токен "протух" (400, 401, 403)
            if ([400, 401, 403].includes(response.status)) {
                this._handleAuthFailure(response.status)
                throw new Error('[Auth] Refresh token expired or invalid, user logged out')
            }
            // Для помилок сервера (500, 503) сховище не чіпаємо, це тимчасовий збій
            throw new Error(`[Auth] Server error during refresh: ${response.status}`)
        }

        const data = await response.json()
        if (!data || !data.accessToken) {
            throw new Error('[Auth] Invalid response structure from refresh endpoint')
        }

        localStorage.setItem('accessToken', data.accessToken)
        if (data.refreshToken) {
            localStorage.setItem('refreshToken', data.refreshToken)
        }
        return data.accessToken
    }

    // Централізований метод очищення та оповіщення додатку
    _handleAuthFailure(status) {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('accessToken')
            localStorage.removeItem('refreshToken')
            // localStorage.clear()
        }

        if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
            const authEvent = new CustomEvent('app:auth-expired', {
                detail: { status: status || 401 },
            })
            window.dispatchEvent(authEvent)

            // window.location.href = '/login'
        }
    }

    /**
     * Повністю універсальний метод перевірки JWT (Node.js + Browser)
     */
    _isJwtExpired(token) {
        try {
            const parts = token.split('.')
            if (parts.length !== 3) return true

            const payloadBase64Url = parts[1]
            // Нормалізуємо Base64URL до стандартного Base64
            let base64 = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/')
            while (base64.length % 4) {
                base64 += '='
            }

            let jsonPayload = ''

            // ПЕРЕВІРКА СЕРЕДОВИЩА: Node.js чи Браузер
            if (typeof globalThis !== 'undefined' && globalThis.Buffer) {
                // Середовище Node.js
                jsonPayload = globalThis.Buffer.from(base64, 'base64').toString('utf8')
            } else if (typeof atob === 'function') {
                // Середовище Браузера
                const binaryString = atob(base64)
                jsonPayload = decodeURIComponent(
                    binaryString
                        .split('')
                        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                        .join(''),
                )
            } else {
                return true // Якщо декодерів немає, вважаємо токен невалідним
            }

            const payload = JSON.parse(jsonPayload)
            if (!payload || !payload.exp) return true

            const currentTimeInSecs = Math.floor(Date.now() / 1000)
            return payload.exp <= currentTimeInSecs + 5 // 5 секунд буфера на затримку мережі
        } catch (err) {
            return true
        }
    }

    async _safeRefreshPipeline() {
        const isInitiator = !this.refreshPromise
        try {
            if (isInitiator) this.refreshPromise = this.refreshTokens()
            return await this.refreshPromise
        } finally {
            if (isInitiator) this.refreshPromise = null
        }
    }

    async _handleUnauthorizedFromServer(endpoint, options) {
        try {
            const newToken = await this._safeRefreshPipeline()

            options.headers['Authorization'] = `Bearer ${newToken}`
            return await this.client.request(endpoint, options)
        } catch (err) {
            throw err
        }
    }
}
