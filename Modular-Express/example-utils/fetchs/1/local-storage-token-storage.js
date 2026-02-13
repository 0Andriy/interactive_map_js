/**
 * Провайдер для збереження токенів у localStorage браузера.
 * Реалізує асинхронний інтерфейс для сумісності з AuthManager.
 */
export class LocalStorageTokenStorage {
    /**
     * @param {Object} config
     * @param {string} [config.accessKey='accessToken'] - Назва ключа для Access Token.
     * @param {string} [config.refreshKey='refreshToken'] - Назва ключа для Refresh Token.
     */
    constructor({ accessKey = 'accessToken', refreshKey = 'refreshToken' } = {}) {
        this.accessKey = accessKey
        this.refreshKey = refreshKey
    }

    /**
     * Отримує пару токенів.
     * @returns {Promise<{accessToken: string|null, refreshToken: string|null}>}
     */
    async get() {
        return {
            accessToken: localStorage.getItem(this.accessKey),
            refreshToken: localStorage.getItem(this.refreshKey),
        }
    }

    /**
     * Зберігає токени.
     * @param {string} accessToken
     * @param {string} refreshToken
     */
    async save(accessToken, refreshToken) {
        if (accessToken) localStorage.setItem(this.accessKey, accessToken)
        if (refreshToken) localStorage.setItem(this.refreshKey, refreshToken)
    }

    /** Очищує сховище при виході */
    async clear() {
        localStorage.removeItem(this.accessKey)
        localStorage.removeItem(this.refreshKey)
    }
}
