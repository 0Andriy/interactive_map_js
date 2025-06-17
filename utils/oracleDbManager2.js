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
     * @property {function(...any): void} error - Logs error messages.
     * @property {function(...any): void} debug - Logs debug messages.
     */
    /**
     * @private
     * The internal default logger object.
     * @type {Logger}
     */
    static #defaultLogger = {
        info: (...args) => console.log('[INFO]', ...args),
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
            // connectString: 'admin', // Consider removing defaults for sensitive info
            sessionCallback: this.initSession.bind(this), // Bind 'this' to ensure logger context
        }

        /**
         * Default OracleDB execution options.
         * @type {object}
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
    async profiler(fn, sql, params, profilerOptions = {}) {
        const start = process.hrtime.bigint()
        const result = await fn()
        const end = process.hrtime.bigint()

        const durationMs = Number(end - start) / 1_000_000

        let loggedParams = params

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
        } else if (this.config.maskingRules && this.config.maskingRules.params) {
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

        this.#logger.info(
            `[ORACLE EXECUTE][${durationMs.toFixed(2)} ms] Script: ${sql}, Params: ${JSON.stringify(
                loggedParams,
            )}`,
        )
        return result
    }

    /**
     * Executes a single SQL query against a specified database.
     * Automatically handles getting and closing the connection if pooling is used.
     * @param {string} dbName - The name of the database to execute the query against.
     * @param {string} sql - The SQL query string to execute.
     * @param {object} [params={}] - Bind parameters for the SQL query.
     * @param {object} [options={}] - OracleDB execution options.
     * @param {boolean} [usePool=this.usePool] - Whether to use a connection from a pool. Defaults to `this.usePool`.
     * @returns {Promise<import('oracledb').Result<any>>} - The result of the SQL execution.
     * @throws {Error} If there is an error during query execution.
     */
    async execute(dbName, sql, params = {}, options = {}, usePool = this.usePool) {
        let connection
        try {
            const generalOptions = await this.mergeOptions(options)
            connection = await this.getConnection(dbName, usePool)

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
            if (connection && usePool) {
                try {
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
     * Automatically handles getting and closing the connection if pooling is used.
     * @param {string} dbName - The name of the database to execute the batch against.
     * @param {string} sql - The SQL query string to execute (e.g., an INSERT statement).
     * @param {Array<object>} [binds=[]] - An array of bind parameter objects for each row/operation.
     * @param {object} [options={}] - OracleDB execution options (e.g., `batchErrors: true`).
     * @param {boolean} [usePool=this.usePool] - Whether to use a connection from a pool. Defaults to `this.usePool`.
     * @returns {Promise<import('oracledb').Result<any>>} - The result of the batch execution.
     * @throws {Error} If there is an error during batch execution.
     */
    async executeMany(dbName, sql, binds = [], options = {}, usePool = this.usePool) {
        let connection
        try {
            const generalOptions = await this.mergeOptions(options)
            connection = await this.getConnection(dbName, usePool)

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
            if (connection && usePool) {
                try {
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

    /**
     * Executes a series of database operations within a transaction.
     * The callback function receives the connection object, allowing multiple
     * operations to use the same transaction. The transaction is committed on success
     * and rolled back on error.
     * @param {string} dbName - The name of the database to perform the transaction on.
     * @param {(connection: import('oracledb').Connection) => Promise<any>} callback - An asynchronous function containing the transaction logic.
     * @param {boolean} [usePool=this.usePool] - Whether to get a connection from a pool for the transaction. Defaults to `this.usePool`.
     * @returns {Promise<any>} - The result of the callback function.
     * @throws {Error} If an error occurs during the transaction, or if the connection cannot be acquired.
     */
    async executeInTransaction(dbName, callback, usePool = this.usePool) {
        let connection
        try {
            connection = await this.getConnection(dbName, usePool)
            this.#logger.info(`Transaction started for ${dbName}.`)

            // Ensure autoCommit is false for transactions
            connection.autoCommit = false

            const result = await callback(connection)

            await connection.commit()
            this.#logger.info(`Transaction committed for ${dbName}.`)

            return result
        } catch (error) {
            if (connection) {
                try {
                    await connection.rollback()
                    this.#logger.error(
                        `Transaction rolled back for ${dbName} due to error: ${error.message}`,
                    )
                } catch (rollbackError) {
                    this.#logger.error(`Error during rollback for ${dbName}:`, rollbackError)
                }
            }
            throw error
        } finally {
            if (connection && usePool) {
                try {
                    // Reset autoCommit to default before returning to pool
                    connection.autoCommit = this.defaultOptions.autoCommit
                    await connection.close()
                } catch (error) {
                    this.#logger.error(
                        `Error closing connection for ${dbName} after transaction:`,
                        error,
                    )
                }
            }
        }
    }

    /**
     * Executes a SQL query using a provided OracleDB connection.
     * This method is particularly useful when you need to perform multiple operations
     * within an existing transaction or with a specific connection, without
     * automatically acquiring and releasing it.
     * @param {import('oracledb').Connection} connection - The OracleDB connection object to use.
     * @param {string} sql - The SQL query string to execute.
     * @param {object} [params={}] - Bind parameters for the SQL query.
     * @param {object} [options={}] - OracleDB execution options. `autoCommit` will be set to `false` by default.
     * @returns {Promise<import('oracledb').Result<any>>} - The result of the SQL execution.
     * @throws {Error} If there is an error during query execution.
     */
    async executeWithConnection(connection, sql, params = {}, options = {}) {
        // Ensure autoCommit is false for operations within a manually managed connection (e.g., transaction)
        const generalOptions = { ...this.defaultOptions, ...options, autoCommit: false }
        try {
            const result = await this.profiler(
                () => connection.execute(sql, params, generalOptions),
                sql,
                params,
            )
            return result
        } catch (error) {
            this.#logger.error(`Error executing query with provided connection: ${sql}`, error)
            throw new Error(
                `Error executing query with provided connection: ${sql} \n${error.message}`,
            )
        }
    }
}

// Export a default instance for convenience.
// It will be initialized with config.oracleDB and the defaultLogger the first time it's imported.
// It's important to provide a valid dbConfig when first importing this module,
// especially if you rely on the default export.
export default OracleDbManager
