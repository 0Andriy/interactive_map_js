import { readFile, writeFile, rename } from 'fs/promises'

/**
 * Провайдер для асинхронного збереження токенів у файлову систему.
 * Атомарне сховище для запобігання пошкодженню JSON файлу.
 */
export class TokenStorage {
    /**
     * @param {Object} config
     * @param {string} config.filePath - Шлях до JSON файлу.
     * @param {string} [config.accessKey='accessToken'] - Ключ для Access Token.
     * @param {string} [config.refreshKey='refreshToken'] - Ключ для Refresh Token.
     */
    constructor({ filePath, accessKey = 'accessToken', refreshKey = 'refreshToken' }) {
        this.filePath = filePath
        this.accessKey = accessKey
        this.refreshKey = refreshKey
    }

    /**
     * Отримує пару токенів із файлу.
     * @returns {Promise<{accessToken: string|null, refreshToken: string|null}>}
     */
    async get() {
        try {
            const content = await readFile(this.filePath, 'utf-8')
            const data = JSON.parse(content)
            return {
                accessToken: data[this.accessKey] || null,
                refreshToken: data[this.refreshKey] || null,
            }
        } catch {
            return { accessToken: null, refreshToken: null }
        }
    }

    /**
     * Зберігає нові токени у файл.
     * @param {string} accessToken
     * @param {string} refreshToken
     */
    async save(accessToken, refreshToken) {
        const data = await this.get()

        if (accessToken) data[this.accessKey] = accessToken
        if (refreshToken) data[this.refreshKey] = refreshToken

        const tmpPath = `${this.filePath}.tmp`
        const payload = JSON.stringify({ ...data }, null, 2)

        // Атомарний запис: спочатку в тимчасовий, потім перейменування
        await writeFile(tmpPath, payload)
        await rename(tmpPath, this.filePath)
    }

    /** Очищує файл сховища */
    async clear() {
        const payload = JSON.stringify({})
        await writeFile(this.filePath, payload)
    }
}
