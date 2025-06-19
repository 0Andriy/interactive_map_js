// OracleDbManager.js
import oracledb from 'oracledb'

/**
 * Manages Oracle Database connections, pooling, and query execution.
 * Provides methods for connecting, executing queries, handling transactions,
 * and managing connections/pools.
 * This class implements the Singleton pattern to ensure only one instance exists.
 */
class OracleDbManager {
    /**
     * @private
     * @type {OracleDbManager | null} The single instance of the class (for Singleton pattern).
     */
    static #instance = null // Use private static field for Singleton instance

    /**
     * @private
     * @typedef {Object} Logger
     * @property {function(...any): void} info - Logs informational messages.
     * @property {function(...any): void} warning - Logs warning messages.
     * @property {function(...any): void} error - Logs error messages.
     * @property {function(...any): void} debug - Logs debug messages.
     */
    static #defaultLogger = {
        info: (...args) => console.log('[INFO]', ...args),
        warning: (...args) => console.log('[WARNING]', ...args),
        error: (...args) => console.error('[ERROR]', ...args),
        debug: (...args) => console.debug('[DEBUG]', ...args),
    }

    /**
     * The logger object used by this instance.
     * @type {Logger}
     */
    #logger = OracleDbManager.#defaultLogger // Use the static default logger

    /**
     * Creates an instance of OracleDbManager.
     * This constructor implements the Singleton pattern. If an instance already exists,
     * it returns the existing instance. Otherwise, it creates a new one.
     * @param {object} dbConfig - The configuration object for database connections (e.g., `config.oracleDB`).
     * @param {Logger} [customLogger=OracleDbManager.#defaultLogger] - Optional custom logger to use instead of the default.
     * @returns {OracleDbManager} The single instance of OracleDbManager.
     * @throws {Error} If `dbConfig.db` is not provided.
     */
    constructor(dbConfig, customLogger = null) {
        // Ensure Singleton pattern: if an instance already exists, return it.
        if (OracleDbManager.#instance) {
            // Note: If a custom logger is provided on subsequent calls, it will be ignored,
            // as the logger is set on the initial creation of the singleton instance.
            return OracleDbManager.#instance
        }

        // Initialize the new instance
        OracleDbManager.#instance = this

        if (!dbConfig || !dbConfig.db) {
            throw new Error(
                'Database configuration (dbConfig.db) is required to initialize OracleDbManager.',
            )
        }

        /**
         * Default connection configuration.
         * IMPORTANT: Do not use default sensitive credentials in production.
         * Use environment variables or secure configuration management.
         * @type {object}
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
            sessionCallback: this.initSession.bind(this), // Bind 'this' to ensure logger context
            // sodaMetaDataCache: false, // Set true to improve SODA collection access performance
            // stmtCacheSize: 30, // number of statements that are cached in the statement cache of each connection
            // enableStatistics: false, // record pool usage for oracledb.getPool().getStatistics() and logStatistics()
        }

        /**
         * Default OracleDB execution options.
         * @type {object}
         */
        this.defaultOptions = {
            autoCommit: true, // Default to autoCommit true for single operations
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            fetchTypeHandler: (metaData) => {
                if (metaData.dbType === oracledb.DB_TYPE_BLOB) {
                    return { type: oracledb.BUFFER }
                }
                if (metaData.dbType === oracledb.DB_TYPE_CLOB) {
                    return { type: oracledb.STRING }
                }
            },
        }

        this.#logger = customLogger || OracleDbManager.#defaultLogger

        /**
         * The `oracledb` library instance.
         * @type {object}
         */
        this.oracledb = oracledb

        /**
         * The configuration object for Oracle databases.
         * @type {object}
         */
        this.config = dbConfig

        if (dbConfig.DriverMode && dbConfig.DriverMode.toLowerCase() === 'thick') {
            try {
                oracledb.initOracleClient(dbConfig.ClientOpts)
                this.#logger.info('Oracle Thick Client initialized.')
            } catch (err) {
                this.#logger.error('Failed to initialize Oracle Thick Client:', err)
                // If thick client initialization is critical, re-throw the error
                // throw new Error(`Failed to initialize Oracle Thick Client: ${err.message}`);
            }
        }

        // Додаємо опцію для профілювання
        this.enableProfiling = dbConfig.enableProfiling === true // За замовчуванням false або undefined

        /**
         * List of allowed database names from the configuration.
         * @type {string[]}
         */
        this.allowedNames = Object.keys(dbConfig.db)

        /**
         * Whether to use connection pooling by default.
         * @type {boolean}
         */
        this.usePool = true

        /**
         * Stores direct connections by database name.
         * @type {Object.<string, import('oracledb').Connection>}
         */
        this.connections = {}

        /**
         * Stores connection pools by database name.
         * @type {Object.<string, import('oracledb').Pool>}
         */
        this.pools = {}
    }

    /**
     * Returns the Singleton instance of the OracleDbManager.
     * If the instance doesn't exist, it creates one with the provided configuration.
     * Subsequent calls will return the same instance, ignoring new config/logger arguments.
     * @param {object} [dbConfig={}] - Database configuration, used only if creating the first instance.
     * @param {Logger} [customLogger=OracleDbManager.#defaultLogger] - Custom logger, used only if creating the first instance.
     * @returns {OracleDbManager} The single instance of OracleDbManager.
     * @throws {Error} If `dbConfig.db` is not provided on the first instance creation.
     */
    static getInstance(dbConfig = {}, customLogger = null) {
        if (!OracleDbManager.#instance) {
            if (!dbConfig || !dbConfig.db) {
                throw new Error('Must provide valid dbConfig on first getInstance() call.')
            }

            OracleDbManager.#instance = new OracleDbManager(dbConfig, customLogger)
        }
        return OracleDbManager.#instance
    }

    /**
     * Initializes a new Oracle session. This method is used as a `sessionCallback`
     * for connections, for example, to set isolation levels.
     * @param {import('oracledb').Connection} connection - The OracleDB connection object.
     * @param {string} requestedTag - The tag associated with the session request.
     * @param {function} callbackFn - The callback function to invoke after session initialization.
     * @returns {Promise<void>}
     */
    async initSession(connection, requestedTag, callbackFn) {
        // 'this' is bound to the OracleDbManager instance in the constructor's defaultConfig.
        this.#logger.info(`Init session for tag: ${requestedTag}`)
        try {
            await connection.execute(`ALTER SESSION SET ISOLATION_LEVEL = READ COMMITTED`)
            this.#logger.info(`Session for tag ${requestedTag} initialized successfully.`)
            callbackFn() // Call the callback after successful execution
        } catch (error) {
            this.#logger.error(`Error initializing session for tag ${requestedTag}:`, error)
            callbackFn(error) // Pass the error to the callback
        }
    }

    /**
     * Checks if a given database name is allowed based on the configured database names.
     * @param {string} dbName - The name of the database to check.
     * @returns {Promise<boolean>} - True if the database is allowed, false otherwise.
     */
    async isDatabaseAllowed(dbName) {
        return this.allowedNames.includes(dbName)
    }

    /**
     * Establishes a connection to a specified Oracle database.
     * It can create a connection pool or a direct connection based on the `usePool` parameter.
     * @param {string} dbName - The name of the database to connect to (must be in config.db).
     * @param {boolean} [usePool=this.usePool] - Whether to use a connection pool. Defaults to `this.usePool`.
     * @returns {Promise<void>}
     * @throws {Error} If the database name is not found in the configuration.
     */
    async connect(dbName, usePool = this.usePool) {
        if (!this.config.db[dbName]) {
            throw new Error(`Database configuration for '${dbName}' not found.`)
        }

        const dbConfig = { ...this.defaultConfig, ...this.config.db[dbName] }

        try {
            if (usePool) {
                if (this.pools[dbName]) {
                    this.#logger.info(`Pool for database: ${dbName} already exists.`)
                    return
                }
                const pool = await oracledb.createPool(dbConfig)
                this.pools[dbName] = pool
                this.#logger.info(`Pool created for database: ${dbName}`)
            } else {
                if (this.connections[dbName]) {
                    this.#logger.info(`Direct connection for database: ${dbName} already exists.`)
                    return
                }
                const connection = await oracledb.getConnection(dbConfig)
                this.connections[dbName] = connection
                this.#logger.info(`Connected directly to database: ${dbName}`)
            }
        } catch (error) {
            this.#logger.error(`Failed to connect to database ${dbName}:`, error)
            throw error
        }
    }

    /**
     * Closes a specific connection or pool for a given database name.
     * If using a pool, the pool is terminated. If using a direct connection, the connection is closed.
     * @param {string} dbName - The name of the database whose connection/pool to close.
     * @param {boolean} [usePool=this.usePool] - Whether to close a pool or a direct connection. Defaults to `this.usePool`.
     * @returns {Promise<void>}
     */
    async close(dbName, usePool = this.usePool) {
        try {
            if (usePool) {
                if (this.pools[dbName]) {
                    await this.pools[dbName].close()
                    delete this.pools[dbName]
                    this.#logger.info(`Closed pool for ${dbName}`)
                } else {
                    this.#logger.info(`No pool found for ${dbName} to close.`)
                }
            } else {
                if (this.connections[dbName]) {
                    await this.connections[dbName].close()
                    delete this.connections[dbName]
                    this.#logger.info(`Closed direct connection for ${dbName}`)
                } else {
                    this.#logger.info(`No direct connection found for ${dbName} to close.`)
                }
            }
        } catch (error) {
            this.#logger.error(`Error closing connection/pool for ${dbName}:`, error)
            throw error
        }
    }

    /**
     * Closes all active connections and connection pools managed by this instance.
     * This is useful for graceful shutdown of the application.
     * @returns {Promise<void>}
     */
    async closeAll() {
        this.#logger.info('Closing all Oracle database connections and pools...')
        const closePromises = []

        // Close all pools
        for (const dbName in this.pools) {
            if (Object.hasOwnProperty.call(this.pools, dbName)) {
                closePromises.push(this.close(dbName, true))
            }
        }

        // Close all direct connections
        for (const dbName in this.connections) {
            if (Object.hasOwnProperty.call(this.connections, dbName)) {
                closePromises.push(this.close(dbName, false))
            }
        }

        try {
            await Promise.allSettled(closePromises)
            this.#logger.info('All Oracle database connections and pools have been closed.')
        } catch (error) {
            this.#logger.error('Error closing all connections/pools:', error)
            // Even if some fail, we try to close all, so just log the error.
        }
    }

    /**
     * Retrieves an OracleDB connection object. If pooling is enabled, it gets a connection from the pool.
     * Otherwise, it returns the direct connection.
     * @param {string} dbName - The name of the database to get a connection for.
     * @param {boolean} [usePool=this.usePool] - Whether to get a connection from a pool or a direct connection. Defaults to `this.usePool`.
     * @returns {Promise<import('oracledb').Connection>} - The OracleDB connection object.
     * @throws {Error} If no pool or direct connection is found for the specified database.
     */
    async getConnection(dbName, usePool = this.usePool) {
        if (usePool) {
            if (!this.pools[dbName]) {
                throw new Error(
                    `No pool found for database '${dbName}'. Please call connect('${dbName}', true) first.`,
                )
            }
            return await this.pools[dbName].getConnection()
        } else {
            const conn = this.connections[dbName]
            if (!conn) {
                throw new Error(
                    `No direct connection found for database '${dbName}'. Please call connect('${dbName}', false) first.`,
                )
            }
            return conn
        }
    }

    /**
     * Merges default OracleDB execution options with user-provided options.
     * It specifically handles `fetchTypeHandler` to allow combining default and custom handlers.
     * User-provided `fetchTypeHandler` takes precedence, and if it doesn't return a value,
     * the default handler is consulted.
     * @param {object} [userOptions={}] - User-defined options to merge.
     * @returns {Promise<object>} - The merged options object.
     */
    async mergeOptions(userOptions = {}) {
        const options = { ...this.defaultOptions, ...userOptions }

        const defaultHandler = this.defaultOptions.fetchTypeHandler
        const userHandler = userOptions.fetchTypeHandler

        // If user didn't specify their own fetchTypeHandler, use the default one.
        if (!userHandler) return options

        // Combined fetchTypeHandler logic
        options.fetchTypeHandler = (metaData) => {
            const userResult = userHandler(metaData)
            // If the user's handler explicitly returned something, use it
            if (userResult !== undefined) return userResult
            // Otherwise, fall back to the default handler
            return defaultHandler ? defaultHandler(metaData) : undefined
        }

        return options
    }

    /**
     * Profiles the execution of an asynchronous function, logging its duration, SQL, and parameters.
     * Sensitive parameters will be masked if `maskSensitiveParams` is true in options.
     * @param {function(): Promise<any>} fn - The asynchronous function to profile (e.g., `connection.execute`).
     * @param {string} sql - The SQL query string.
     * @param {object | Array<object>} params - The parameters/binds for the SQL query.
     * @param {object} [profilerOptions={}] - Options for profiler (e.g., `maskSensitiveParams: true`).
     * @returns {Promise<any>} - The result of the profiled function.
     */
    async profiler(fn, sql, params) {
        // Перевіряємо, чи увімкнено профілювання
        if (!this.enableProfiling) {
            return await fn() // Якщо вимкнено, просто виконайте функцію без профілювання
        }

        const start = process.hrtime.bigint()
        const result = await fn()
        const end = process.hrtime.bigint()

        const durationMs = Number(end - start) / 1_000_000

        let loggedParams = this._maskParams(params)

        this.#logger.info(
            `[ORACLE EXECUTE][${durationMs.toFixed(2)} ms] Script: ${sql}, Params: ${JSON.stringify(
                loggedParams,
            )}`,
        )
        return result
    }

    /**
     * Masks SQL parameters based on global config rules.
     * @private
     * @param {object | Array<object>} params - SQL parameters to mask.
     * @returns {object | Array<object>} Masked parameters.
     */
    _maskParams(params) {
        // Застосовуємо маскування, якщо воно налаштоване
        if (this.config.maskAllParams) {
            // Просте маскування всіх значень
            if (Array.isArray(params)) {
                loggedParams = params.map((p) => {
                    const masked = {}
                    for (const key in p) {
                        masked[key] = '[REDACTED]'
                    }
                    return masked
                })
            } else if (typeof params === 'object' && params !== null) {
                const masked = {}
                for (const key in params) {
                    masked[key] = '[REDACTED]'
                }
                loggedParams = masked
            }
        } else if (this.config.maskingRules && this.config.maskingRules?.params) {
            // Маскування за правилами (патернами)
            const applyMasking = (obj) => {
                if (typeof obj !== 'object' || obj === null) return obj

                const maskedObj = { ...obj }
                for (const key in maskedObj) {
                    if (Object.hasOwnProperty.call(maskedObj, key)) {
                        const value = maskedObj[key]
                        for (const rule of this.config.maskingRules.params) {
                            if (rule.pattern.test(key)) {
                                // Перевіряємо ключ на відповідність патерну
                                maskedObj[key] = rule.replaceWith
                                break // Застосовуємо перше відповідне правило
                            }
                        }
                    }
                }
                return maskedObj
            }

            if (Array.isArray(params)) {
                loggedParams = params.map(applyMasking)
            } else if (typeof params === 'object' && params !== null) {
                loggedParams = applyMasking(params)
            }
        }

        return params
    }

    /**
     * Executes a single SQL query against a specified database.
     * Automatically handles getting and closing the connection if pooling is used and no existing connection is provided.
     * When `connection` is provided (e.g., for transactions), `autoCommit` should be managed externally.
     * @param {string} dbName - The name of the database to execute the query against.
     * @param {string} sql - The SQL query string to execute.
     * @param {object} [params={}] - Bind parameters for the SQL query.
     * @param {object} [options={}] - OracleDB execution options.
     * @param {boolean} [usePool=this.usePool] - Whether to use a connection from a pool. Defaults to `this.usePool`.
     * @param {import('oracledb').Connection} [connectionToUse=null] - An optional existing connection to use (for transactions).
     * @returns {Promise<import('oracledb').Result<any>>} - The result of the SQL execution.
     * @throws {Error} If there is an error during query execution.
     */
    async execute(
        dbName,
        sql,
        params = {},
        options = {},
        usePool = this.usePool,
        connectionToUse = null,
    ) {
        let connection = connectionToUse
        let connectionAcquiredLocally = false // Flag to know if we acquired the connection in this method

        try {
            const generalOptions = await this.mergeOptions(options)

            if (!connection) {
                // If no connection is provided, acquire one locally
                connection = await this.getConnection(dbName, usePool)
                connectionAcquiredLocally = true
            } else {
                // If a connectionToUse is provided, ensure autoCommit is false for it
                // as it's assumed to be part of a larger transaction or manually managed.
                generalOptions.autoCommit = false
            }

            const result = await this.profiler(
                () => connection.execute(sql, params, generalOptions),
                sql,
                params,
            )

            return result
        } catch (error) {
            this.#logger.error(`Error executing query: ${sql}`, error)
            throw new Error(`Error executing query: ${sql} \n${error.message}`)
        } finally {
            // Only close the connection if it was acquired within this method and pooling is used.
            // If connectionToUse was provided, it's the caller's responsibility to close/release it.
            if (connectionAcquiredLocally && connection && usePool) {
                try {
                    connection.autoCommit = this.defaultOptions.autoCommit
                    await connection.close()
                } catch (error) {
                    this.#logger.error(
                        `Error closing connection for ${dbName} after execute:`,
                        error,
                    )
                }
            }
        }
    }

    /**
     * Executes multiple SQL queries in a batch (e.g., for bulk inserts/updates).
     * Automatically handles getting and closing the connection if pooling is used and no existing connection is provided.
     * When `connection` is provided (e.g., for transactions), `autoCommit` should be managed externally.
     * @param {string} dbName - The name of the database to execute the batch against.
     * @param {string} sql - The SQL query string to execute (e.g., an INSERT statement).
     * @param {Array<object>} [binds=[]] - An array of bind parameter objects for each row/operation.
     * @param {object} [options={}] - OracleDB execution options (e.g., `batchErrors: true`).
     * @param {boolean} [usePool=this.usePool] - Whether to use a connection from a pool. Defaults to `this.usePool`.
     * @param {import('oracledb').Connection} [connectionToUse=null] - An optional existing connection to use (for transactions).
     * @returns {Promise<import('oracledb').Result<any>>} - The result of the batch execution.
     * @throws {Error} If there is an error during batch execution.
     */
    async executeMany(
        dbName,
        sql,
        binds = [],
        options = {},
        usePool = this.usePool,
        connectionToUse = null,
    ) {
        let connection = connectionToUse
        let connectionAcquiredLocally = false

        try {
            const generalOptions = await this.mergeOptions(options)

            if (!connection) {
                // If no connection is provided, acquire one locally
                connection = await this.getConnection(dbName, usePool)
                connectionAcquiredLocally = true
            } else {
                // If a connectionToUse is provided, ensure autoCommit is false for it
                // as it's assumed to be part of a larger transaction or manually managed.
                generalOptions.autoCommit = false
            }

            const result = await this.profiler(
                () => connection.executeMany(sql, binds, generalOptions),
                sql,
                binds,
            )

            return result
        } catch (error) {
            this.#logger.error(`Error executing queryMany: ${sql}`, error)
            throw new Error(`Error executing queryMany: ${sql} \n${error.message}`)
        } finally {
            if (connectionAcquiredLocally && connection && usePool) {
                try {
                    connection.autoCommit = this.defaultOptions.autoCommit
                    await connection.close()
                } catch (error) {
                    this.#logger.error(
                        `Error closing connection for ${dbName} after executeMany:`,
                        error,
                    )
                }
            }
        }
    }

    // <========================= Методи для транзакцій ====================================>

    /**
     * Begins a new transaction by acquiring a connection and setting autoCommit to false.
     * This connection *must* be explicitly committed or rolled back and then released.
     * @param {string} dbName - The name of the database to start the transaction on.
     * @param {boolean} [usePool=true] - Whether to get a connection from a pool. It's highly recommended to use a pool for transactions.
     * @returns {Promise<import('oracledb').Connection>} The OracleDB connection object for the transaction.
     * @throws {Error} If unable to acquire a connection.
     */
    async beginTransaction(dbName, usePool = true) {
        this.#logger.info(`Starting transaction for database: ${dbName}`)
        try {
            const connection = await this.getConnection(dbName, usePool)
            // Ensure autoCommit is false for transactions
            connection.autoCommit = false
            return connection
        } catch (error) {
            this.#logger.error(`Failed to begin transaction for ${dbName}:`, error)
            throw error
        }
    }

    /**
     * Commits the transaction on the given connection and releases it back to the pool.
     * @param {import('oracledb').Connection} connection - The connection object on which to commit.
     * @returns {Promise<void>}
     */
    async commit(connection) {
        if (!connection) {
            this.#logger.error('Attempted to commit with a null or undefined connection.')
            throw new Error('No connection provided for commit operation.')
        }

        this.#logger.info('Committing transaction.')

        try {
            await connection.commit()
            this.#logger.info('Transaction committed successfully.')
        } catch (error) {
            this.#logger.error('Error committing transaction:', error)
            throw error
        } finally {
            // Always release the connection back to the pool after commit
            try {
                connection.autoCommit = this.defaultOptions.autoCommit
                await connection.close()
            } catch (releaseError) {
                this.#logger.error('Error releasing connection after commit:', releaseError)
            }
        }
    }

    /**
     * Rolls back the transaction on the given connection and releases it back to the pool.
     * @param {import('oracledb').Connection} connection - The connection object on which to rollback.
     * @returns {Promise<void>}
     */
    async rollback(connection) {
        if (!connection) {
            this.#logger.error('Attempted to rollback with a null or undefined connection.')
            throw new Error('No connection provided for rollback operation.')
        }

        this.#logger.info('Rolling back transaction.')

        try {
            await connection.rollback()
            this.#logger.info('Transaction rolled back successfully.')
        } catch (error) {
            this.#logger.error('Error rolling back transaction:', error)
            throw error
        } finally {
            // Always release the connection back to the pool after rollback
            try {
                connection.autoCommit = this.defaultOptions.autoCommit
                await connection.close()
            } catch (releaseError) {
                this.#logger.error('Error releasing connection after rollback:', releaseError)
            }
        }
    }

    /**
     * Executes a callback function within a database transaction.
     * Automatically handles transaction initiation, commit, rollback, and connection release.
     * This method simplifies transaction management by abstracting the `beginTransaction`,
     * `commit`, and `rollback` calls.
     *
     * @param {string} dbName - The name of the database for the transaction.
     * @param {(connection: import('oracledb').Connection) => Promise<any>} callback - An asynchronous function
     * that receives the transaction connection and performs database operations.
     * @param {boolean} [usePool=true] - Whether to acquire the connection from a pool. Defaults to true.
     * @returns {Promise<any>} The result of the callback function.
     * @throws {Error} If the transaction fails, the error will be re-thrown after rollback.
     */
    async withTransaction(dbName, callback, usePool = this.usePool) {
        let connection
        try {
            // 1. Acquire a connection and start the transaction
            connection = await this.beginTransaction(dbName, usePool)
            this.#logger.debug(`Connection acquired for transaction: ${dbName}`)

            // 2. Execute the user's callback function with the transaction connection
            // The callback is responsible for using this connection for all its DB operations.
            const result = await callback(connection)

            // 3. If the callback completes successfully, commit the transaction
            await this.commit(connection)
            // await connection.commit()

            this.#logger.debug('Transaction successfully committed via withTransaction.')
            return result
        } catch (error) {
            // 4. If any error occurs, rollback the transaction
            this.#logger.error(`Error during transaction for ${dbName}:`, error)
            if (connection) {
                await this.rollback(connection)
                // await connection.rollback()
                this.#logger.debug('Transaction rolled back via withTransaction.')
            }
            throw error // Re-throw the error so the caller knows the transaction failed
        } finally {
            // Only close the connection if it was acquired within this method and pooling is used.
            // If connectionToUse was provided, it's the caller's responsibility to close/release it.
            if (connection && usePool) {
                try {
                    connection.autoCommit = this.defaultOptions.autoCommit
                    await connection.close()
                } catch (error) {
                    this.#logger.error(
                        `Error closing connection for ${dbName} after withTransaction:`,
                        error,
                    )
                }
            }
        }
    }
}

// Export a default instance for convenience.
// It will be initialized with config.oracleDB and the defaultLogger the first time it's imported.
// It's important to provide a valid dbConfig when first importing this module,
// especially if you rely on the default export.
export default OracleDbManager
