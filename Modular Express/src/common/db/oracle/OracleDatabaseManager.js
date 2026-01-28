import { OracleDatabaseService } from './OracleDatabaseService.js'

/**
 * Менеджер для керування декількома інстансами Oracle баз даних.
 * Патерн - Registry + Singleton + Strategy
 */
export class OracleDatabaseManager {
    /**
     * Статичне поле для зберігання єдиного екземпляра
     * @type {OracleDatabaseManager|null}
     * @private
     */
    static #instance = null

    /**
     * @param {Object} logger - Об'єкт логера.
     */
    constructor(logger = null) {
        // Якщо інстанс вже є — повертаємо його
        if (OracleDatabaseManager.#instance) {
            return OracleDatabaseManager.#instance
            // throw new Error('Use OracleDatabaseManager.getInstance() instead of new')
        }
        // Зберігаємо посилання на цей екземпляр
        OracleDatabaseManager.#instance = this

        this.logger = logger?.child?.({ component: 'OracleDatabaseManager' }) ?? logger

        /** @type {Map<string, OracleDatabaseService>} */
        this.databases = new Map()
    }

    /**
     * Основний метод для отримання єдиного екземпляра класу.
     * @returns {OracleDatabaseManager}
     */
    static getInstance() {
        if (!OracleDatabaseManager.#instance) {
            throw new Error("Manager not initialized! Call 'new OracleDatabaseManager()' first.")
            // OracleDatabaseManager.#instance = new OracleDatabaseManager()
        }
        return OracleDatabaseManager.#instance
    }

    /**
     * Реєстрація та ініціалізація бази даних.
     * @param {string} alias - Унікальне ім'я (напр. 'CORE', 'BILLING').
     * @param {Object} config - Конфігурація Oracle.
     * @param {Object} [opts] - Додаткові опції.
     * @param {boolean} [opts.isStandalone=false] - Чи використовувати пряме підключення замість пулу.
     * @param {Object} [opts.thickModeOptions=null] - Опції для Thick режиму. Якщо передано, активує Thick.
     */
    async register(alias, config, { isStandalone = false, thickModeOptions = null } = {}) {
        if (this.databases.has(alias)) {
            this.logger?.warn?.(`Database alias "${alias}" is already registered.`)
            return
        }

        const dbService = new OracleDatabaseService({
            logger: this.logger,
            config,
            isStandalone,
            thickModeOptions,
        })

        try {
            await dbService.initialize()
            this.databases.set(alias, dbService)

            const mode = dbService.oracledb.thin ? 'Thin' : 'Thick'
            this.logger?.info?.(`Database "${alias}" registered successfully`, {
                isStandalone,
                mode,
            })
        } catch (error) {
            this.logger?.error?.(`Failed to register database "${alias}"`, { error: error.message })
            throw error
        }
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
     * Отримання сервісу бази даних за його іменем.
     * @param {string} alias
     * @returns {OracleDatabaseService}
     */
    get(alias) {
        const service = this.databases.get(alias)
        if (!service) {
            const error = `Database with alias "${alias}" not found in Manager.`
            this.logger?.error?.(error)
            throw new Error(error)
        }
        return service
    }

    /**
     * Перевіряє, чи зареєстрована база даних (стратегія) за вказаним аліасом.
     *
     * @param {string} alias - Унікальне ім'я бази (напр. 'CORE').
     * @returns {boolean}
     */
    has(alias) {
        return this.databases.has(alias)
    }

    /**
     * Повертає список усіх зареєстрованих аліасів баз даних.
     * Корисно для систем моніторингу або динамічного вибору бази.
     *
     * @returns {string[]} Масив аліасів.
     */
    list() {
        return Array.from(this.databases.keys())
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
        for (const alias of aliases) {
            await this.unregister(alias)
        }

        this.databases.clear()

        this.logger?.info?.('All database connections closed.')
    }
}
