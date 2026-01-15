import { OracleDatabaseService } from './OracleDatabaseService.js'

/**
 * Менеджер для керування декількома інстансами Oracle баз даних.
 * Патерн - Registry
 */
export class OracleDatabaseManager {
    /**
     * @param {Object} logger - Глобальний логер додатка.
     */
    constructor(logger) {
        this.logger = logger?.child?.({ component: 'OracleDatabaseManager' }) ?? logger
        /** @type {Map<string, OracleDatabaseService>} */
        this.databases = new Map()
    }

    /**
     * Реєстрація та ініціалізація бази даних.
     * @param {string} alias - Унікальне ім'я (напр. 'CORE', 'BILLING').
     * @param {Object} config - Конфігурація Oracle.
     * @param {boolean} [isStandalone=false] - Чи використовувати пряме підключення замість пулу.
     */
    async register(alias, config, isStandalone = false) {
        if (this.databases.has(alias)) {
            this.logger?.warn?.(`Database alias "${alias}" is already registered.`)
            return
        }

        const dbService = new OracleDatabaseService({
            logger: this.logger,
            config,
            isStandalone,
        })

        // Ініціалізуємо пул відразу, якщо це не standalone режим
        if (!isStandalone) {
            await dbService.initialize()
        }

        this.databases.set(alias, dbService)
        this.logger?.info?.(`Database "${alias}" registered successfully`, { isStandalone })
    }

    /**
     * Отримання сервісу бази даних за його іменем.
     * @param {string} alias
     * @returns {OracleDatabaseService}
     */
    db(alias) {
        const service = this.databases.get(alias)
        if (!service) {
            const error = `Database with alias "${alias}" not found in Manager.`
            this.logger?.error?.(error)
            throw new Error(error)
        }
        return service
    }

    /**
     * Динамічне видалення бази даних та закриття її пулу.
     * @param {string} alias - Назва бази, яку потрібно видалити.
     */
    async unregister(alias) {
        const service = this.databases.get(alias)

        if (!service) {
            this.logger?.warn?.(`Attempted to unregister non-existent database: ${alias}`)
            return false
        }

        try {
            this.logger?.info?.(`Unregistering database "${alias}"...`)

            // 1. Закриваємо пул (або standalone з'єднання)
            await service.close()

            // 2. Видаляємо з Map, щоб розірвати посилання для Garbage Collector
            this.databases.delete(alias)

            this.logger?.info?.(`Database "${alias}" removed and resources released.`)
            return true
        } catch (error) {
            this.logger?.error?.(`Error during unregistering database "${alias}"`, {
                error: error.message,
            })
            // Навіть якщо сталася помилка, видаляємо з реєстру,
            // щоб не намагатися використовувати "бите" підключення
            this.databases.delete(alias)
            throw error
        }
    }

    /**
     * Перевірка здоров'я всіх зареєстрованих баз.
     */
    async checkAllHealth() {
        const results = {}
        for (const [alias, service] of this.databases) {
            results[alias] = await service.isHealthy()
        }
        return results
    }

    /**
     * Коректне закриття всіх пулів (наприклад, при вимкненні сервера).
     */
    async closeAll() {
        this.logger?.info?.('Shutting down all database connections...')

        const aliases = Array.from(this.databases.keys())
        const closures = aliases.map((alias) => this.unregister(alias))

        await Promise.all(closures)
        this.logger?.info?.('All database connections closed.')
    }
}
