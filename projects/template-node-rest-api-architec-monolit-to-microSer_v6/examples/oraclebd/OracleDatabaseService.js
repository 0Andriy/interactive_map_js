import oracledb from 'oracledb'

/**
 * @typedef {Object} InternalContext
 * @property {import('oracledb').Connection} [connection] - Активна сесія для транзакцій.
 * @property {string} [traceId] - Унікальний ідентифікатор для сквозного логування.
 * @property {number} [startTime] - Мітка часу початку операції для вимірювання тривалості.
 */

/**
 * Senior-level обгортка над Oracle Database для Node.js (ES6).
 * Реалізує DI, DRY, паттерн контексту та безпечну роботу з сесіями.
 */
export class OracleDatabaseService {
    /**
     * @param {Object} opts - Налаштування сервісу.
     * @param {Object} opts.logger - Екземпляр логера з підтримкою .child() та опціональних викликів.
     * @param {import('oracledb').PoolAttributes} opts.config - Конфігурація підключення.
     * @param {boolean} [opts.isStandalone=false] - Режим роботи без пулу (прямі підключення).
     */
    constructor(opts = {}) {
        this.oracledb = oracledb
        this.isStandalone = opts.isStandalone || false

        /**
         * Ініціалізація логера через DI з контекстом компонента
         */
        this.logger = opts.logger?.child?.({ component: 'OracleDatabaseService' }) ?? opts.logger

        /**
         * Дефолтні налаштування пулу
         */
        this.defaultConfig = {
            // user: 'admin', // Consider removing defaults for sensitive info
            // password: 'admin', // Consider removing defaults for sensitive info
            // connectString: `(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=ip)(PORT=port)))(CONNECT_DATA=(SID=sid)))`, // Consider removing defaults for sensitive info
            // edition: 'ORA$BASE', // used for Edition Based Redefintion
            // events: false, // whether to handle Oracle Database FAN and RLB events or support CQN
            // externalAuth: false, // whether connections should be established using External Authentication
            // homogeneous: true, // all connections in the pool have the same credentials
            // poolAlias: 'default', // set an alias to allow access to the pool via a name.
            // poolIncrement: 1, // only grow the pool by one connection at a time
            // poolMax: 4, // maximum size of the pool. (Note: Increase UV_THREADPOOL_SIZE if you increase poolMax in Thick mode)
            // poolMin: 0, // start with no connections; let the pool shrink completely
            // poolPingInterval: 60, // check aliveness of connection if idle in the pool for 60 seconds
            // poolTimeout: 60, // terminate connections that are idle in the pool for 60 seconds
            // queueMax: 500, // don't allow more than 500 unsatisfied getConnection() calls in the pool queue
            // queueTimeout: 60000, // terminate getConnection() calls queued for longer than 60000 milliseconds
            sessionCallback: this.initSession.bind(this), // Binds 'this' to OracleDbManager instance
            // sodaMetaDataCache: false, // Set true to improve SODA collection access performance
            // stmtCacheSize: 30, // number of statements that are cached in the statement cache of each connection
            // enableStatistics: false, // record pool usage for oracledb.getPool().getStatistics() and logStatistics()
        }
        this.config = { ...this.defaultConfig, ...opts.config }

        /**
         * Дефолтні опції виконання запитів
         */
        this.defaultOptions = {
            autoCommit: true,
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            fetchTypeHandler: (metaData) => {
                if (metaData.dbType === oracledb.DB_TYPE_BLOB) {
                    return { type: oracledb.BUFFER }
                }
                if (metaData.dbType === oracledb.DB_TYPE_CLOB) {
                    return { type: oracledb.STRING }
                }
                return undefined
            },
        }

        this.pool = null
    }

    /**
     * Ініціалізація кожної нової сесії (наприклад, встановлення рівня ізоляції).
     */
    async initSession(connection, requestedTag, callbackFn) {
        this.logger?.debug?.(`Initializing new session settings for tag: ${requestedTag}`)
        try {
            await connection.execute(`ALTER SESSION SET ISOLATION_LEVEL = READ COMMITTED`)
            this.logger?.info?.(`Session for tag ${requestedTag} initialized successfully.`)
            callbackFn()
        } catch (error) {
            this.logger?.error?.(`Error initializing session for tag ${requestedTag}:`, error)
            callbackFn(error)
        }
    }

    /**
     * Ініціалізація пулу з'єднань (тільки для не-standalone режиму).
     */
    async initialize() {
        if (this.pool) return
        if (this.isStandalone) return

        try {
            this.pool = await this.oracledb.createPool(this.config)
            this.logger?.info?.('Oracle Pool initialized', {
                poolAlias: this.config.poolAlias || 'default',
                poolMax: this.config.poolMax,
            })
        } catch (error) {
            this.logger?.error?.('Failed to initialize Oracle pool', { error: error.message })
            throw error
        }
    }

    // --- Приватні допоміжні методи (Core) ---

    /**
     * Отримання з'єднання залежно від контексту та режиму роботи.
     * @private
     */
    async _acquireConnection(internalCtx) {
        if (internalCtx.connection) {
            return { conn: internalCtx.connection, isLocal: false }
        }

        if (this.isStandalone) {
            return { conn: await this.oracledb.getConnection(this.config), isLocal: true }
        }

        if (!this.pool) {
            await this.initialize()
            return { conn: await this.pool.getConnection(), isLocal: true }
        }
    }

    /**
     * Безпечне повернення з'єднання в пул або закриття сесії.
     * @private
     */
    async _releaseConnection(conn, isLocal) {
        if (isLocal && conn) {
            try {
                await conn.close()
            } catch (err) {
                this.logger?.error?.('Error closing Oracle connection', { error: err.message })
            }
        }
    }

    /**
     * Злиття дефолтних та користувацьких опцій запиту.
     * @private
     */
    async _mergeOptions(userOptions = {}, inTransaction = false) {
        const options = { ...this.defaultOptions, ...userOptions }

        // В транзакції autoCommit має бути завжди false
        if (inTransaction) {
            options.autoCommit = false
        }

        const defaultHandler = this.defaultOptions.fetchTypeHandler
        const userHandler = userOptions.fetchTypeHandler

        // If user didn't specify their own fetchTypeHandler, use the default one.
        if (!userHandler) return options

        // Combined fetchTypeHandler logic: user's handler takes precedence
        options.fetchTypeHandler = (metaData) => {
            const userResult = userHandler(metaData)
            // If the user's handler explicitly returned something (even null), use it
            if (userResult !== undefined) return userResult
            // Otherwise, fall back to the default handler
            return defaultHandler ? defaultHandler(metaData) : undefined
        }

        return options
    }

    // --- Публічні методи виконання запитів ---

    /**
     * Основний метод виконання SQL запиту.
     * @param {string} sql - SQL текст.
     * @param {Object|Array} params - Bind параметри.
     * @param {import('oracledb').ExecuteOptions} options - Опції виконання.
     * @param {InternalContext} internalCtx - Внутрішній контекст.
     */
    async execute(sql, params = {}, options = {}, internalCtx = {}) {
        const { conn, isLocal } = await this._acquireConnection(internalCtx)
        const combinedOptions = await this._mergeOptions(options, !isLocal)
        const start = internalCtx.startTime || Date.now()

        try {
            const result = await conn.execute(sql, params, combinedOptions)

            this.logger?.debug?.('SQL Executed', {
                sql,
                duration: `${Date.now() - start}ms`,
                traceId: internalCtx.traceId,
            })

            return result
        } catch (error) {
            this.logger?.error?.('Execution error', {
                sql,
                message: error.message,
                offset: error.offset,
                traceId: internalCtx.traceId,
            })
            throw error
        } finally {
            await this._releaseConnection(conn, isLocal)
        }
    }

    /**
     * Масове виконання (Bulk insert/update).
     */
    async executeMany(sql, bindsArray = [], options = {}, internalCtx = {}) {
        const { conn, isLocal } = await this._acquireConnection(internalCtx)
        const combinedOptions = await this._mergeOptions(options, !isLocal)
        const start = internalCtx.startTime || Date.now()

        try {
            const result = await conn.executeMany(sql, bindsArray, combinedOptions)

            this.logger?.debug?.('Bulk SQL Executed', {
                count: bindsArray.length,
                duration: `${Date.now() - start}ms`,
            })

            return result
        } catch (error) {
            this.logger?.error?.('ExecuteMany Error', {
                sql,
                count: bindsArray.length,
                message: error.message,
                offset: error.offset,
                traceId: internalCtx.traceId,
            })
            throw error
        } finally {
            await this._releaseConnection(conn, isLocal)
        }
    }

    /**
     * Отримання масиву об'єктів (Select).
     */
    async select(sql, params = {}, options = {}, internalCtx = {}) {
        const result = await this.execute(sql, params, options, internalCtx)
        return result.rows || []
    }

    /**
     * Отримання одного запису.
     */
    async findOne(sql, params = {}, options = {}, internalCtx = {}) {
        const rows = await this.select(sql, params, { ...options, maxRows: 1 }, internalCtx)
        return rows[0] || null
    }

    /**
     * Робота з великими даними через Stream (особлива логіка закриття)
     */
    async queryStream(sql, params = {}, options = {}, internalCtx = {}) {
        const { conn, isLocal } = await this._acquireConnection(internalCtx)
        const combinedOptions = await this._mergeOptions(options, !isLocal)

        try {
            this.logger?.debug?.('Starting Stream', { sql, traceId: internalCtx.traceId })

            const stream = conn.queryStream(sql, params, combinedOptions)

            stream.on('close', async () => {
                this.logger?.debug?.('Stream closed', { traceId: internalCtx.traceId })
                // Стрім сам керує закриттям з'єднання через подію close, якщо воно локальне
                if (isLocal) {
                    await this._releaseConnection(conn, isLocal)
                }
            })

            stream.on('error', async (err) => {
                this.logger?.error?.('Stream error', {
                    error: err.message,
                    traceId: internalCtx.traceId,
                })
                // Стрім сам керує закриттям з'єднання через подію close, якщо воно локальне
                if (isLocal) {
                    await this._releaseConnection(conn, isLocal)
                }
            })

            return stream
        } catch (error) {
            this.logger?.error?.('Failed to initiate stream', {
                error: error.message,
                traceId: internalCtx.traceId,
            })
            if (isLocal) {
                await this._releaseConnection(conn, isLocal)
            }
            throw error
        }
    }

    /**
     * Виконання декількох запитів в одній транзакції (Транзакційна обгортка).
     * @param {Function} callbackFn - Асинхронна функція з об'єктом транзакції.
     */
    async withTransaction(callbackFn) {
        // Для транзакції ми ЗАВЖДИ створюємо локальне з'єднання (isLocal: true)
        const { conn: connection, isLocal } = await this._acquireConnection({})
        const startTime = Date.now()
        const traceId = `trId-${Math.random().toString(36).substring(2, 11)}`

        const internalCtx = {
            connection: conn,
            traceId,
            startTime,
        }

        try {
            this.logger?.debug?.('Transaction Started', { traceId })

            const ctx = {
                execute: (sql, binds, opts) => {
                    return this.execute(sql, binds, { ...opts, autoCommit: false }, internalCtx)
                },
                executeMany: (sql, binds, opts) => {
                    return this.executeMany(sql, binds, { ...opts, autoCommit: false }, internalCtx)
                },
                select: (sql, binds, opts) => {
                    return this.select(sql, binds, { ...opts, autoCommit: false }, internalCtx)
                },
                findOne: (sql, binds, opts) => {
                    return this.findOne(sql, binds, { ...opts, autoCommit: false }, internalCtx)
                },
                queryStream: (sql, binds, opts) => {
                    return this.queryStream(sql, binds, { ...opts, autoCommit: false }, internalCtx)
                },
            }

            const result = await callbackFn(ctx)

            await connection.commit()

            this.logger?.info?.('Transaction Committed', {
                traceId,
                duration: `${Date.now() - startTime}ms`,
            })

            return result
        } catch (error) {
            if (connection) {
                await connection.rollback()
            }
            this.logger?.error?.('Transaction failed (Rolled Back)', {
                error: error.message,
                traceId,
            })
            throw error
        } finally {
            await this._releaseConnection(conn, isLocal)
        }
    }

    // --- Методи автентифікації та безпеки ---

    /**
     * Перевірка автентифікації (логіна/пароля ) користувача БД.
     */
    async authenticateUser(user, password) {
        try {
            // Намагаємося підключитися напряму (не через загальний пул)
            const connection = await this.oracledb.getConnection({
                user,
                password,
                connectString: this.config.connectString,
            })
            await connection.close()
            this.logger?.info?.('User authenticated via Oracle', { user })
            return true
        } catch (err) {
            this.logger?.warn?.('Oracle authentication failed', { user, error: err.message })
            return false
        }
    }

    /**
     * Зміна пароля користувача (користувач міняє сам собі).
     */
    async changeOwnPassword(user, oldPassword, newPassword) {
        try {
            // Метод changePassword не потребує відкритого з'єднання,
            // він працює під час встановлення зв'язку
            const connection = await this.oracledb.getConnection({
                user,
                password: oldPassword,
                connectString: this.config.connectString,
                newPassword,
            })
            await connection.close()
            this.logger?.info?.('Password changed successfully by user', { user })
            return true
        } catch (err) {
            this.logger?.error?.('Failed to change password', { user, error: err.message })
            throw err
        }
    }

    /**
     * Адмінська зміна пароля будь-якого користувача (права DBA)
     * @param {string} targetUser - кого міняємо
     * @param {string} newPassword - новий пароль
     */
    async adminResetPassword(targetUser, newPassword) {
        // Запобігаємо SQL Injection, валідуючи ім'я користувача (Oracle ідентифікатори)
        if (!/^[a-zA-Z0-9_$]+$/.test(targetUser)) {
            throw new Error('Invalid Oracle username format')
        }

        // Пароль краще передавати через змінні, але в ALTER USER він іде як текст.
        // Ми використовуємо лапки для безпеки ідентифікаторів.
        const sql = `ALTER USER "${targetUser.toUpperCase()}" IDENTIFIED BY "${newPassword}"`

        try {
            // Виконуємо через адміністративний пул
            await this.execute(sql)
            this.logger?.info?.('Administrator reset password', { targetUser })
            return true
        } catch (err) {
            this.logger?.error?.('Admin reset password failed', { targetUser, error: err.message })
            throw err
        }
    }

    // --- Системні методи ---

    /**
     * Перевірка стану бази даних (Liveness Probe).
     */
    async isHealthy() {
        try {
            await this.execute('SELECT 1 FROM DUAL', {}, { timeout: 1500 })
            return true
        } catch (err) {
            this.logger?.error?.('Health Check failed', { error: err.message })
            return false
        }
    }

    /**
     * Коректне завершення роботи пулу.
     */
    async close() {
        try {
            if (this.pool) {
                this.logger?.info?.('Closing Oracle Connection Pool...')
                await this.pool.close(10) // Очікування завершення активних запитів 10 сек
                this.logger?.info?.('Oracle Pool closed safely.')
            }
        } catch (error) {
            this.logger?.error?.('Error during pool shutdown', { error: error.message })
        }
    }
}
