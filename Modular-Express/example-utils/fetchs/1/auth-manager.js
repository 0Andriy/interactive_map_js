/**
 * Керує життєвим циклом токенів. Підтримує випереджальне оновлення.
 */
export class AuthManager {
    /**
     * @param {Object} params
     * @param {TokenStorage} params.storage - Сховище токенів.
     * @param {Function} params.refreshService - Функція оновлення (приймає rt, повертає {accessToken, refreshToken}).
     * @param {Function} [params.onAuthError] - Дія при невдалому оновленні (наприклад, розлогін).
     * @param {Logger} [params.logger] - Екземпляр логера.
     */
    constructor({ storage, refreshService, onAuthError, logger }) {
        this.storage = storage
        this.refreshService = refreshService
        this.onAuthError = onAuthError
        this.logger = logger?.child?.({ context: 'AuthManager' }) ?? logger
        this.refreshTask = null
        this.serverTimeOffset = 0 // Різниця між сервером і клієнтом
    }

    /**
     * Отримує діючий Access Token.
     * Якщо токен скоро протухне, запускає фонове оновлення.
     * @returns {Promise<string|null>}
     */
    async getAccessToken() {
        const { accessToken } = await this.storage.get()

        if (accessToken) {
            // Перевіряємо, чи не час оновити токен заздалегідь
            const shouldRefresh = this._isTokenExpiringSoon(accessToken)

            if (shouldRefresh) {
                this.logger?.info?.('Токен скоро протухне. Запуск випереджального оновлення...')
                // Запускаємо оновлення фоново (не чекаючи на await),
                // щоб поточний запит не гальмував, якщо токен ще технічно валідний
                this.refresh().catch((err) => {
                    this.logger?.error?.('Помилка фонового оновлення', { error: err.message })
                })
            }
        }

        return accessToken
    }

    /**
     * Перевіряє JWT токен на термін дії.
     * Крос-платформний парсинг JWT (Node.js + Browser)
     * @param {string} token
     * @param {number} [bufferInSeconds=60] - Запас часу до завершення (наприклад, 1 хв)
     * @private
     */
    _isTokenExpiringSoon(token, bufferInSeconds = 60) {
        try {
            // JWT складається з [header, payload, signature]
            const base64Url = token.split('.')[1]
            if (!base64Url) return false

            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')

            // Парсимо payload без зовнішніх бібліотек
            const jsonPayload =
                typeof Buffer !== 'undefined'
                    ? Buffer.from(base64, 'base64').toString() // Node.js
                    : decodeURIComponent(
                          atob(base64)
                              .split('')
                              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                              .join(''),
                      ) // Browser

            const { exp } = JSON.parse(jsonPayload)

            if (!exp) return false

            // Враховуємо зміщення часу сервера
            const now = Math.floor((Date.now() + this.serverTimeOffset) / 1000)
            // Повертає true, якщо до кінця дії лишилося менше ніж bufferInSeconds
            return exp - now < bufferInSeconds
        } catch (error) {
            this.logger?.warn?.('Не вдалося розпарсити токен для перевірки часу дії', {
                error: error.message,
            })
            return false
        }
    }

    /**
     * Оновлює пару токенів (Singleton проміс)
     */
    async refresh() {
        if (this.refreshTask) return await this.refreshTask

        this.refreshTask = (async () => {
            try {
                this.logger?.info?.('Запуск процесу оновлення сесії...')
                const { refreshToken: oldRt } = await this.storage.get()
                if (!oldRt) throw new Error('Refresh token missing')

                const startTime = Date.now()
                const tokens = await this.refreshService(oldRt)

                // Якщо сервер прислав дату в заголовках, рахуємо зсув
                // (передається зовні через сервіс)
                if (tokens.serverDate) {
                    this.serverTimeOffset = new Date(tokens.serverDate).getTime() - startTime
                }

                await this.storage.save(tokens.accessToken, tokens.refreshToken)

                this.logger?.info?.('Токени успішно оновлено')
                return tokens.accessToken
            } catch (error) {
                this.logger?.error?.('Критична помилка оновлення сесії', { error: error.message })
                await this.storage.clear()
                
                if (this.onAuthError) {
                    await this.onAuthError(error)
                }
                throw error
            } finally {
                this.refreshTask = null
            }
        })()

        return this.refreshTask
    }
}
