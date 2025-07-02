// OracleDbManager.js
import oracledb from 'oracledb'

/**
 * @typedef {Object} Logger
 * @property {function(...any): void} debug - Logs debug messages.
 * @property {function(...any): void} info - Logs informational messages.
 * @property {function(...any): void} warn - Logs warning messages.
 * @property {function(...any): void} error - Logs error messages.
 */

/**
 * @typedef {Object} DbConnectionConfig
 * @property {string} user - The database username.
 * @property {string} password - The database password.
 * @property {string} connectString - The Oracle Net connect string or Net Service Name.
 * @property {string} [edition] - Used for Edition Based Redefinition.
 * @property {boolean} [events] - Whether to handle Oracle Database FAN and RLB events or support CQN.
 * @property {boolean} [externalAuth] - Whether connections should be established using External Authentication.
 * @property {boolean} [homogeneous] - All connections in the pool have the same credentials.
 * @property {string} [poolAlias] - Set an alias to allow access to the pool via a name.
 * @property {number} [poolIncrement] - Only grow the pool by one connection at a time.
 * @property {number} [poolMax] - Maximum size of the pool. (Note: Increase UV_THREADPOOL_SIZE if you increase poolMax in Thick mode).
 * @property {number} [poolMin] - Start with no connections; let the pool shrink completely.
 * @property {number} [poolPingInterval] - Check aliveness of connection if idle in the pool for X seconds.
 * @property {number} [poolTimeout] - Terminate connections that are idle in the pool for X seconds.
 * @property {number} [queueMax] - Don't allow more than X unsatisfied getConnection() calls in the pool queue.
 * @property {number} [queueTimeout] - Terminate getConnection() calls queued for longer than X milliseconds.
 * @property {function(import('oracledb').Connection, string, function(Error|null): void): void} [sessionCallback] - Callback function called when a new session is established.
 * @property {boolean} [sodaMetaDataCache] - Set true to improve SODA collection access performance.
 * @property {number} [stmtCacheSize] - Number of statements that are cached in the statement cache of each connection.
 * @property {boolean} [enableStatistics] - Record pool usage for oracledb.getPool().getStatistics() and logStatistics().
 */

/**
 * @typedef {Object} OracleDbManagerConfig
 * @property {Object.<string, DbConnectionConfig>} db - Object where keys are database names and values are their connection configurations.
 * @property {boolean} [useThickMode=false] - Whether to use Oracle Thick Client mode.
 * @property {Object} [ClientOpts] - Options for `oracledb.initOracleClient` if `useThickMode` is true.
 * @property {string} [ClientOpts.libDir] - The directory where the Oracle Client libraries are located.
 * @property {boolean} [enableProfiling=false] - Whether to enable query profiling and logging of execution times.
 * @property {boolean} [maskAllParams=false] - If true, all query parameters will be masked in logs. Overrides `maskingRules`.
 * @property {Object} [maskingRules] - Rules for masking sensitive parameters in logs.
 * @property {Array<Object>} [maskingRules.params] - Array of masking rules for parameters.
 * @property {RegExp} [maskingRules.params[].pattern] - Regular expression to match parameter keys for masking.
 * @property {string} [maskingRules.params[].replaceWith='[REDACTED]'] - The string to replace the parameter value with.
 * @property {RegExp[]} [maskingRules.params[].excludePatterns] - Array of RegExp patterns to exclude specific keys from masking, even if they match `pattern`.
 * @property {boolean} [usePool=true] - Default setting for whether to use connection pooling for new connections.
 */

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
    static #instance = null

    /**
     * @private
     * @type {Logger} The default logger implementation using `console`.
     */
    static #defaultLogger = {
        debug: (...args) => console.debug(`[DEBUG][${new Date().toISOString()}]`, ...args),
        info: (...args) => console.log(`[INFO][${new Date().toISOString()}]`, ...args),
        warn: (...args) => console.log(`[WARN][${new Date().toISOString()}]`, ...args),
        error: (...args) => console.error(`[ERROR][${new Date().toISOString()}]`, ...args),
    }

    /**
     * @private
     * @type {Logger} The logger object used by this instance. Can be customized during initialization.
     */
    #logger = OracleDbManager.#defaultLogger

    /**
     * @private
     * @type {boolean} Flag indicating whether the manager has been initialized.
     */
    #isInitialized = false

    /**
     * @private
     * @type {Promise<void> | null} A promise that resolves when initialization is complete.
     * Used to prevent multiple simultaneous initializations.
     */
    #initializingPromise = null

    /**
     * Creates an instance of OracleDbManager.
     * This constructor implements the Singleton pattern. If an instance already exists,
     * it returns the existing instance. Otherwise, it creates a new one.
     * The actual configuration and initialization happens in the `initialize` method.
     */
    constructor() {
        if (OracleDbManager.#instance) {
            return OracleDbManager.#instance
        }
        OracleDbManager.#instance = this

        /**
         * The `oracledb` library instance.
         * @type {object}
         */
        this.oracledb = oracledb

        /**
         * Default configuration options for Oracle database connections.
         * These can be overridden by specific database configurations provided during initialization.
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
            sessionCallback: this.initSession.bind(this), // Binds 'this' to OracleDbManager instance
            // sodaMetaDataCache: false, // Set true to improve SODA collection access performance
            // stmtCacheSize: 30, // number of statements that are cached in the statement cache of each connection
            // enableStatistics: false, // record pool usage for oracledb.getPool().getStatistics() and logStatistics()
        }

        /**
         * Default OracleDB execution options.
         * These can be overridden by options passed to `execute` or `executeMany`.
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
                return undefined // Let other types be handled by default or subsequent handlers
            },
        }

        /**
         * The configuration object for Oracle databases, set during initialization.
         * @type {OracleDbManagerConfig | null}
         */
        this.config = null

        /**
         * Whether to enable query profiling (logging execution times and SQL).
         * Set during initialization based on `dbConfig.enableProfiling`.
         * @type {boolean}
         */
        this.enableProfiling = false

        /**
         * List of allowed database names from the configuration.
         * Populated during initialization based on `dbConfig.db` keys.
         * @type {string[]}
         */
        this.allowedNames = []

        /**
         * Whether to use connection pooling by default for `connect` and `getConnection`.
         * Can be overridden by the `usePool` parameter in specific methods.
         * @type {boolean}
         */
        this.usePool = true

        /**
         * Stores direct connections by database name.
         * Used when `usePool` is explicitly false for a connection.
         * @type {Object.<string, import('oracledb').Connection>}
         */
        this.connections = {}

        /**
         * Stores connection pools by database name.
         * Used when `usePool` is true.
         * @type {Object.<string, import('oracledb').Pool>}
         */
        this.pools = {}
    }

    /**
     * Returns the Singleton instance of the OracleDbManager.
     * This method does NOT initialize the instance. Call `initialize()` separately
     * after obtaining the instance for the first time.
     * @returns {OracleDbManager} The single instance of OracleDbManager.
     */
    static getInstance() {
        if (!OracleDbManager.#instance) {
            OracleDbManager.#instance = new OracleDbManager()
        }
        return OracleDbManager.#instance
    }

    /**
     * Initializes (configure) the OracleDbManager with database configuration and an optional custom logger.
     * This method should be called once at application startup before any database operations.
     * It handles Oracle Thick Client initialization and sets up internal configuration.
     * Subsequent calls with different config/logger will be ignored if already initialized.
     *
     * @param {OracleDbManagerConfig} dbConfig - The configuration object for database connections (e.g., `config.oracleDB`).
     * @param {Logger} [customLogger=OracleDbManager.#defaultLogger] - Optional custom logger to use instead of the default.
     * @returns {Promise<void>} A promise that resolves when initialization is complete.
     * @throws {Error} If `dbConfig.db` is not provided, or if Thick Client initialization fails.
     */
    async initialize(dbConfig, customLogger = null) {
        if (this.#isInitialized) {
            this.#logger.info(
                'OracleDbManager is already initialized. Subsequent initialization calls are ignored.',
            )
            return // Already initialized, do nothing
        }

        // If already initializing, wait for the existing initialization to complete
        if (this.#initializingPromise) {
            this.#logger.debug(
                'OracleDbManager is already initializing, waiting for existing process to complete.',
            )
            return this.#initializingPromise
        }

        // Wrap the initialization logic in a promise to track its completion
        this.#initializingPromise = (async () => {
            this.#logger = customLogger || OracleDbManager.#defaultLogger
            this.#logger.info('Initializing OracleDbManager...')

            if (!dbConfig || !dbConfig.db) {
                throw new Error(
                    'Database configuration (dbConfig.db) is required to initialize OracleDbManager.',
                )
            }

            this.config = dbConfig
            this.enableProfiling = dbConfig.enableProfiling === true
            this.allowedNames = Object.keys(dbConfig.db)
            // Allow overriding default usePool, otherwise use the class default (true)
            this.usePool = typeof dbConfig.usePool === 'boolean' ? dbConfig.usePool : this.usePool

            if (dbConfig.useThickMode) {
                try {
                    // Ensure ClientOpts are provided if Thick Mode is enabled
                    if (!dbConfig.ClientOpts || !dbConfig.ClientOpts.libDir) {
                        this.#logger.warn(
                            'useThickMode is true but ClientOpts.libDir is not provided. Thick Client might not initialize correctly.',
                        )
                    }
                    oracledb.initOracleClient(dbConfig.ClientOpts)
                    this.#logger.info('Oracle Thick Client initialized.')
                } catch (err) {
                    this.#logger.error('Failed to initialize Oracle Thick Client:', err)
                    // If thick client initialization is critical for your application, re-throw the error
                    throw new Error(`Failed to initialize Oracle Thick Client: ${error.message}`)
                }
            }

            this.#isInitialized = true
            this.#logger.info('OracleDbManager initialization complete.')
        })()

        return this.#initializingPromise
    }

    /**
     * Checks if the OracleDbManager instance has been initialized.
     * @returns {boolean} True if initialized, false otherwise.
     */
    isInitialized() {
        return this.#isInitialized
    }

    /**
     * Callback function executed when a new session is established in a connection pool.
     * This is used to set session-specific properties, e.g., isolation level.
     * @param {import('oracledb').Connection} connection - The database connection object.
     * @param {string} requestedTag - The connection tag (if any).
     * @param {function(Error|null): void} callbackFn - The callback function to call after session initialization.
     * @returns {Promise<void>}
     */
    async initSession(connection, requestedTag, callbackFn) {
        this.#logger.info(`Initializing session for tag: ${requestedTag}`)
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
     * Checks if a given database name is allowed based on the initialized configuration.
     * @param {string} dbName - The name of the database to check.
     * @returns {Promise<boolean>} True if the database name is in the allowed list, false otherwise.
     */
    async isDatabaseAllowed(dbName) {
        return this.allowedNames.includes(dbName)
    }

    /**
     * Establishes a connection or creates a connection pool for a specified database.
     * If a pool or direct connection already exists for the given `dbName`, it will be reused.
     * @param {string} dbName - The name of the database to connect to (must be defined in `dbConfig.db`).
     * @param {boolean} [usePool=this.usePool] - Whether to use a connection pool (true) or a direct connection (false).
     * @returns {Promise<void>} A promise that resolves when the connection/pool is successfully established and pinged.
     * @throws {Error} If the manager is not initialized, database configuration is not found, or connection fails.
     */
    async connect(dbName, usePool = this.usePool) {
        if (!this.#isInitialized) {
            throw new Error('OracleDbManager is not initialized. Call initialize() first.')
        }
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

            // Verify connection by pinging the database
            const isConnected = await this.ping(dbName, usePool)
            if (!isConnected)
                throw new Error(`Database '${dbName}' not responsive after initial creation.`)
        } catch (error) {
            this.#logger.error(`Failed to connect to database ${dbName}:`, error)
            throw error
        }
    }

    /**
     * Closes an active connection or connection pool for a specified database.
     * @param {string} dbName - The name of the database whose connection/pool to close.
     * @param {boolean} [usePool=this.usePool] - Whether to close a connection pool (true) or a direct connection (false).
     * @returns {Promise<void>} A promise that resolves when the connection/pool is successfully closed.
     * @throws {Error} If the manager is not initialized or closing fails.
     */
    async close(dbName, usePool = this.usePool) {
        if (!this.#isInitialized) {
            this.#logger.warn(
                'Attempted to close connection/pool on uninitialized OracleDbManager.',
            )
            return // Nothing to close if not initialized
        }
        try {
            if (usePool) {
                if (this.pools[dbName]) {
                    await this.pools[dbName].close(0)
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
     * Closes all active database connections and pools managed by this instance.
     * This method should be called during application shutdown.
     * @returns {Promise<void>} A promise that resolves when all connections/pools are attempted to be closed.
     * Errors during individual closes are logged but do not stop the process.
     */
    async closeAllConnections() {
        if (!this.#isInitialized) {
            this.#logger.warn(
                'Attempted to close all connections/pools on uninitialized OracleDbManager.',
            )
            return
        }
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
            this.#isInitialized = false // Reset initialized state after closing all connections
        } catch (error) {
            this.#logger.error('Error closing all connections/pools:', error)
            // Even if some fail, we try to close all, so just log the error.
        }
    }

    /**
     * Retrieves a database connection. If pooling is enabled, gets a connection from the pool.
     * Otherwise, returns the established direct connection.
     * @param {string} dbName - The name of the database to get a connection for.
     * @param {boolean} [usePool=this.usePool] - Whether to retrieve from a pool (true) or a direct connection (false).
     * @returns {Promise<import('oracledb').Connection>} A promise that resolves with the OracleDB connection object.
     * @throws {Error} If the manager is not initialized or no connection/pool is found for `dbName`.
     */
    async getConnection(dbName, usePool = this.usePool) {
        if (!this.#isInitialized) {
            throw new Error('OracleDbManager is not initialized. Call initialize() first.')
        }
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
     * Pings the specified database to check its responsiveness.
     * Acquires a connection (from pool or direct) to execute a simple query.
     * @param {string} dbName - The name of the database to ping.
     * @param {boolean} [usePool=this.usePool] - Whether to acquire a connection from a pool (true) or use a direct connection (false).
     * @returns {Promise<boolean>} A promise that resolves to `true` if the ping is successful, `false` otherwise.
     * @throws {Error} If the manager is not initialized or cannot acquire a connection.
     */
    async ping(dbName, usePool = this.usePool) {
        if (!this.#isInitialized) {
            throw new Error('OracleDbManager is not initialized. Call initialize() first.')
        }
        let connection = null
        let connectionAcquiredLocally = false // Flag to know if we acquired the connection in this method
        try {
            // If using pool, we get a connection from the pool.
            // If direct connection, we get the already existing one.
            connection = await this.getConnection(dbName, usePool)
            connectionAcquiredLocally = true // We acquired it, so we are responsible for closing/releasing it

            // Execute a simple query. SELECT 1 FROM DUAL is a standard way for Oracle.
            await connection.execute('SELECT 1 FROM DUAL')
            this.#logger.info(`Successfully pinged database '${dbName}'.`)
            return true
        } catch (error) {
            this.#logger.error(`Failed to ping database '${dbName}':`, error)
            return false
        } finally {
            // Important: release the connection back to the pool if we acquired it and pooling is used.
            // If it was a direct connection (usePool=false), it's not released here.
            if (connectionAcquiredLocally && connection && usePool) {
                try {
                    connection.autoCommit = this.defaultOptions.autoCommit // Reset autoCommit
                    await connection.close() // Release connection back to pool
                } catch (releaseError) {
                    this.#logger.error(
                        `Error releasing connection after ping for '${dbName}':`,
                        releaseError,
                    )
                }
            }
        }
    }

    /**
     * Merges user-provided options with default OracleDB execution options.
     * Handles custom `fetchTypeHandler` by prioritizing user's handler
     * and falling back to the default handler if the user's returns `undefined`.
     * @param {object} [userOptions={}] - User-provided execution options.
     * @returns {Promise<object>} - The merged options object.
     */
    async mergeOptions(userOptions = {}) {
        const options = { ...this.defaultOptions, ...userOptions }

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

    /**
     * Profiles the execution of a given asynchronous function by measuring its duration.
     * Logs the execution time, SQL query, and masked parameters if profiling is enabled.
     * @param {function(): Promise<any>} fn - The asynchronous function to profile (e.g., `connection.execute`).
     * @param {string} sql - The SQL query string.
     * @param {object | Array<object> | Array<Array<any>>} [params] - The parameters used in the SQL query.
     * @returns {Promise<any>} The result of the profiled function.
     */
    async profiler(fn, sql, params) {
        // Check if profiling is enabled
        if (!this.enableProfiling) {
            return await fn() // If disabled, just execute the function without profiling
        }

        let durationMs = 0 // Initialize duration for error logging
        let loggedParams = params // Default to original params for logging
        let normalizedSql = sql // Default to original SQL for logging

        try {
            const start = process.hrtime.bigint()
            const result = await fn()
            const end = process.hrtime.bigint()

            /*const*/ durationMs = Number(end - start) / 1_000_000

            /*let*/ loggedParams = this._maskParams(params)

            /*const*/ normalizedSql = sql
                .replace(/\n/g, ' ') // Замінити всі нові рядки одним пробілом
                .replace(/\s+/g, ' ') // Замінити кілька пробілів (включаючи ті, що з нових рядків) одним пробілом
                .trim()

            this.#logger.info(
                `\n[ORACLE EXECUTE][${durationMs.toFixed(2)} ms] Script: ${normalizedSql}`, //\nParams: ${JSON.stringify(loggedParams, null, 2)}
                {
                    sql: normalizedSql.substring(0, 200) + (sql.length > 200 ? '...' : ''), // Обрізаємо довгий SQL
                    binds: loggedParams, //Object.keys(params).length > 0 ? Object.keys(params) : 'No params', // Показуємо тільки ключі для params
                    rowsAffected: result.rowsAffected,
                    operation: normalizedSql.trim().split(' ')[0].toUpperCase(), // INSERT, UPDATE, DELETE, SELECT
                    durationMs: durationMs,
                },
            )

            return result
        } catch (error) {
            this.#logger.error(
                `\n[ORACLE EXECUTE][${durationMs.toFixed(
                    2,
                )} ms] Script: ${sql}, \nParams: ${JSON.stringify(loggedParams, null, 2)}`,
                {
                    sql: normalizedSql.substring(0, 200) + (sql.length > 200 ? '...' : ''), // Обрізаємо довгий SQL
                    binds: loggedParams, //Object.keys(params).length > 0 ? Object.keys(params) : 'No params', // Показуємо тільки ключі для params
                    error: error.message,
                    oracleErrorNum: error.errorNum,
                    stack: error.stack, // Логуємо стек-трейс для дебагу
                },
            )

            throw error
        }
    }

    /**
     * @private
     * Masks sensitive parameters based on configuration rules.
     * @param {object | Array<object> | Array<Array<any>>} params - The parameters to mask.
     * @returns {object | Array<object> | Array<Array<any>>} The masked parameters.
     */
    _maskParams(params) {
        let loggedParams = params

        // Apply global masking if enabled
        if (this.config && this.config.maskAllParams) {
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
        } else if (this.config && this.config.maskingRules && this.config.maskingRules?.params) {
            // Apply masking based on patterns
            const applyMasking = (obj) => {
                if (typeof obj !== 'object' || obj === null) return obj

                const maskedObj = { ...obj }
                for (const key in maskedObj) {
                    if (Object.hasOwnProperty.call(maskedObj, key)) {
                        const value = maskedObj[key]
                        for (const rule of this.config.maskingRules.params) {
                            let isExcluded = false
                            if (rule.excludePatterns && rule.excludePatterns.length > 0) {
                                isExcluded = rule.excludePatterns.some((excludePattern) =>
                                    excludePattern.test(key),
                                )
                            }

                            if (rule.pattern.test(key) && !isExcluded) {
                                maskedObj[key] = rule.replaceWith || '[REDACTED]'
                                break // Apply the first matching rule
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

        return loggedParams
    }

    /**
     * Executes an SQL query against the specified database.
     * Automatically manages connections (acquiring from a pool or using a direct connection).
     * Supports profiling and parameter masking.
     *
     * @param {string} dbName - The name of the database to execute the query against.
     * @param {string} sql - The SQL query string.
     * @param {object | Array<any> | Array<Array<any>>} [params={}] - Bind parameters for the query.
     * @param {object} [options={}] - OracleDB execution options (e.g., `autoCommit`, `outFormat`).
     * @param {boolean} [usePool=this.usePool] - Whether to use a connection pool (true) or a direct connection (false).
     * @param {import('oracledb').Connection | null} [connectionToUse=null] - An optional existing connection to use (e.g., for transactions).
     * If provided, `autoCommit` will be forced to `false` for this execution.
     * @returns {Promise<import('oracledb').Result<any>>} A promise that resolves with the result of the execution.
     * @throws {Error} If the manager is not initialized, query execution fails, or connection acquisition fails.
     */
    async execute(
        dbName,
        sql,
        params = {},
        options = {},
        usePool = this.usePool,
        connectionToUse = null,
    ) {
        if (!this.#isInitialized) {
            throw new Error('OracleDbManager is not initialized. Call initialize() first.')
        }
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
            // throw new Error(`Error executing query: ${sql} \n${error.message}`)
            throw error
        } finally {
            // Only close/release the connection if it was acquired within this method and pooling is used.
            // If connectionToUse was provided, it's the caller's responsibility to close/release it.
            if (connectionAcquiredLocally && connection && usePool) {
                try {
                    connection.autoCommit = this.defaultOptions.autoCommit // Reset autoCommit to default for the pool
                    await connection.close() // Release connection back to pool
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
     * Executes multiple SQL operations in a single round trip to the database.
     * This is efficient for batch inserts, updates, or deletes.
     * Automatically manages connections (acquiring from a pool or using a direct connection).
     * Supports profiling and parameter masking.
     *
     * @param {string} dbName - The name of the database to execute the query against.
     * @param {string} sql - The SQL query string.
     * @param {Array<object> | Array<Array<any>>} [binds=[]] - An array of bind parameter objects or arrays for each operation.
     * @param {object} [options={}] - OracleDB execution options.
     * @param {boolean} [usePool=this.usePool] - Whether to use a connection pool (true) or a direct connection (false).
     * @param {import('oracledb').Connection | null} [connectionToUse=null] - An optional existing connection to use (e.g., for transactions).
     * If provided, `autoCommit` will be forced to `false` for this execution.
     * @returns {Promise<import('oracledb').Result<any>>} A promise that resolves with the result of the execution.
     * @throws {Error} If the manager is not initialized, batch execution fails, or connection acquisition fails.
     */
    async executeMany(
        dbName,
        sql,
        binds = [],
        options = {},
        usePool = this.usePool,
        connectionToUse = null,
    ) {
        if (!this.#isInitialized) {
            throw new Error('OracleDbManager is not initialized. Call initialize() first.')
        }
        let connection = connectionToUse
        let connectionAcquiredLocally = false

        try {
            const generalOptions = await this.mergeOptions(options)

            if (!connection) {
                connection = await this.getConnection(dbName, usePool)
                connectionAcquiredLocally = true
            } else {
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
            // throw new Error(`Error executing queryMany: ${sql} \n${error.message}`)
            throw error
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

    //   ---
    //   ## Transaction Methods
    //   ---

    /**
     * Begins a new transaction by acquiring a connection and setting its `autoCommit` to false.
     * The returned connection must be used for all operations within the transaction.
     * It is the caller's responsibility to call `commit()` or `rollback()` and then `connection.close()`
     * (or use `withTransaction` for automatic handling).
     *
     * @param {string} dbName - The name of the database for the transaction.
     * @param {boolean} [usePool=true] - Whether to acquire the connection from a pool. Default to true for transactions.
     * @returns {Promise<import('oracledb').Connection>} A promise that resolves with the connection object set for manual commit.
     * @throws {Error} If the manager is not initialized or fails to acquire a connection.
     */
    async beginTransaction(dbName, usePool = true) {
        if (!this.#isInitialized) {
            throw new Error('OracleDbManager is not initialized. Call initialize() first.')
        }
        this.#logger.info(`Starting transaction for database: ${dbName}`)
        try {
            const connection = await this.getConnection(dbName, usePool)
            // Ensure autoCommit is false for transactions
            connection.autoCommit = false
            // Start the transaction block
            await connection.execute('BEGIN')

            return connection
        } catch (error) {
            this.#logger.error(`Failed to begin transaction for ${dbName}:`, error)
            throw error
        }
    }

    /**
     * Commits the transaction on the given connection and releases it back to the pool.
     * It's crucial to call this method after successful operations within a transaction.
     * @param {import('oracledb').Connection} connection - The connection object on which to commit.
     * @returns {Promise<void>}
     * @throws {Error} If no connection is provided or the commit operation fails.
     */
    async commit(connection) {
        if (!this.#isInitialized) {
            throw new Error('OracleDbManager is not initialized. Call initialize() first.')
        }
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
            // (This assumes connections obtained for transactions are always from a pool)
            try {
                connection.autoCommit = this.defaultOptions.autoCommit // Reset autoCommit
                await connection.close() // Release connection back to pool
            } catch (releaseError) {
                this.#logger.error('Error releasing connection after commit:', releaseError)
            }
        }
    }

    /**
     * Rolls back the transaction on the given connection and releases it back to the pool.
     * It's crucial to call this method if any operation within a transaction fails.
     * @param {import('oracledb').Connection} connection - The connection object on which to rollback.
     * @returns {Promise<void>}
     * @throws {Error} If no connection is provided or the rollback operation fails.
     */
    async rollback(connection) {
        if (!this.#isInitialized) {
            throw new Error('OracleDbManager is not initialized. Call initialize() first.')
        }
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
            // (This assumes connections obtained for transactions are always from a pool)
            try {
                connection.autoCommit = this.defaultOptions.autoCommit // Reset autoCommit
                await connection.close() // Release connection back to pool
            } catch (releaseError) {
                this.#logger.error('Error releasing connection after rollback:', releaseError)
            }
        }
    }

    /**
     * Executes a callback function within a database transaction.
     * Automatically handles transaction beginning, committing on success,
     * and rolling back on error. The connection is automatically released to the pool.
     *
     * @param {string} dbName - The name of the database for the transaction.
     * @param {function(import('oracledb').Connection): Promise<any>} callback - An async function that receives the transaction connection.
     * All database operations within this callback should use the provided connection.
     * @param {boolean} [usePool=true] - Whether to acquire the connection from a pool. Defaults to true.
     * @returns {Promise<any>} A promise that resolves with the result of the callback function.
     * @throws {Error} If the manager is not initialized, any error occurs during the transaction,
     * or if the callback throws an error.
     */
    async withTransaction(dbName, callback, usePool = true) {
        if (!this.#isInitialized) {
            throw new Error('OracleDbManager is not initialized. Call initialize() first.')
        }
        let connection
        try {
            // 1. Acquire a connection and start the transaction
            connection = await this.beginTransaction(dbName, usePool)
            this.#logger.debug(`Connection acquired for transaction: ${dbName}`)

            // 2. Execute the user's callback function with the transaction connection
            // The callback is responsible for using this connection for all its DB operations.
            const result = await callback(connection)

            // 3. If the callback completes successfully, commit the transaction
            await this.commit(connection) // commit also closes the connection
            connection = null // Mark connection as handled

            this.#logger.debug('Transaction successfully committed via withTransaction.')
            return result
        } catch (error) {
            // 4. If any error occurs, rollback the transaction
            this.#logger.error(`Error during transaction for ${dbName}:`, error)
            if (connection) {
                await this.rollback(connection) // rollback also closes the connection
                connection = null // Mark connection as handled
                this.#logger.debug('Transaction rolled back via withTransaction.')
            }
            throw error // Re-throw the error so the caller knows the transaction failed
        } finally {
            // Ensure connection is released if it was acquired by beginTransaction
            // but somehow not handled by commit/rollback (e.g., an error before commit/rollback was called)
            if (connection && usePool) {
                try {
                    connection.autoCommit = this.defaultOptions.autoCommit // Reset autoCommit
                    await connection.close()
                } catch (error) {
                    this.#logger.error(
                        `Error closing connection for ${dbName} in withTransaction finally block:`,
                        error,
                    )
                }
            }
        }
    }

    //   ---
    //   ## User Authentication and Password Management Methods
    //   ---

    /**
     * Authenticates a user against a specific Oracle database using provided credentials.
     * This creates a temporary direct connection and closes it immediately after authentication.
     * It does not use connection pooling for authentication.
     *
     * @param {string} dbName - The name of the database to authenticate against.
     * @param {string} username - The username for authentication.
     * @param {string} password - The password for authentication.
     * @returns {Promise<boolean>} A promise that resolves to `true` if authentication is successful, `false` if credentials are invalid.
     * @throws {Error} If the manager is not initialized, database configuration is not found, or other connection errors occur (e.g., network issues).
     */
    async authenticateUser(dbName, username, password) {
        if (!this.#isInitialized) {
            throw new Error('OracleDbManager is not initialized. Call initialize() first.')
        }
        if (!this.config.db[dbName]) {
            throw new Error(`Database configuration for '${dbName}' not found for authentication.`)
        }

        let connection
        try {
            const baseDbConfig = this.config.db[dbName]
            const connectionConfig = {
                ...this.defaultConfig,
                ...baseDbConfig,
                user: username,
                password: password,
                poolAlias: undefined, // Ensure a temporary, non-pooled connection
            }

            // Try to connect with the provided credentials
            connection = await this.oracledb.getConnection(connectionConfig)
            this.#logger.info(
                `User '${username}' successfully authenticated to database '${dbName}'.`,
            )
            return true
        } catch (error) {
            this.#logger.warn(
                `Authentication failed for user '${username}' on database '${dbName}':`,
                error.message,
            )
            // You can check for specific Oracle error codes if needed
            // For example, ORA-01017: invalid username/password; logon denied
            if (error.code === 'ORA-01017') {
                return false // Explicitly indicate authentication failed due to invalid credentials
            }
            throw error // Re-throw other errors (e.g., network issues, configuration problems)
        } finally {
            // Always close the temporary connection
            if (connection) {
                try {
                    await connection.close()
                    this.#logger.debug(`Closed temporary connection for user '${username}'.`)
                } catch (closeError) {
                    this.#logger.error(
                        `Error closing temporary authentication connection for user '${username}':`,
                        closeError,
                    )
                }
            }
        }
    }

    /**
     * Allows a user to change their own password in the specified Oracle database.
     * This operation connects using the old password and then uses `oracledb.passwordChange`
     * to update it. This method does not require elevated privileges if the old password is correct.
     *
     * @param {string} dbName - The name of the database.
     * @param {string} username - The username whose password is to be changed.
     * @param {string} oldPassword - The current (old) password of the user.
     * @param {string} newPassword - The new password for the user.
     * @returns {Promise<boolean>} A promise that resolves to `true` if the password was successfully changed, `false` if the old password was incorrect or new password is same.
     * @throws {Error} If the manager is not initialized, database configuration is not found, or other errors occur during the process.
     */
    async changePassword(dbName, username, oldPassword, newPassword) {
        if (!this.#isInitialized) {
            throw new Error('OracleDbManager is not initialized. Call initialize() first.')
        }
        if (!this.config.db[dbName]) {
            throw new Error(
                `Database configuration for '${dbName}' not found for password change operation.`,
            )
        }

        if (!username || !oldPassword || !newPassword) {
            throw new Error(
                'Username, old password, and new password are required to change password.',
            )
        }

        if (oldPassword === newPassword) {
            this.#logger.warn(
                `User '${username}' attempted to change password to the same old password.`,
            )
            // Oracle will also throw ORA-28008 if new password matches old
            return false
        }

        let connection
        try {
            const baseDbConfig = this.config.db[dbName]

            // 1. Try to connect using the OLD password.
            // Even if the password is "expired", oracledb allows connection for passwordChange purposes.
            const connectionConfig = {
                ...this.defaultConfig,
                ...baseDbConfig,
                user: username,
                password: oldPassword, // Use old password to connect
                poolAlias: undefined, // Ensure a temporary, non-pooled connection
            }

            // Important: getConnection might throw ORA-01017 if oldPassword is wrong
            // or ORA-28001 if password expired, but still provides a connection object for oracledb.passwordChange.
            // However, we still want to catch ORA-01017 here.
            try {
                connection = await this.oracledb.getConnection(connectionConfig)
            } catch (connError) {
                if (connError.code === 'ORA-01017') {
                    this.#logger.warn(
                        `Password change failed for user '${username}' on database '${dbName}': Invalid old password provided.`,
                    )
                    return false // Old password is incorrect
                }
                // For ORA-28001 (password expired), getConnection still returns a connection object,
                // and passwordChange can use it. But it's better to catch other connection errors.
                this.#logger.error(
                    `Failed to connect as user '${username}' for password change:`,
                    connError.message,
                )
                throw connError // Re-throw other connection errors
            }

            this.#logger.info(
                `Attempting password change for user '${username}' on database '${dbName}'.`,
            )

            // 2. Use oracledb.passwordChange()
            // This method securely changes the password and handles EXPIRED state.
            // It does not require explicit ALTER USER and does not require additional privileges.
            await this.oracledb.passwordChange(connection, username, oldPassword, newPassword)

            this.#logger.info(
                `Password successfully changed for user '${username}' on database '${dbName}'.`,
            )
            return true
        } catch (error) {
            // Handle SPECIFIC Oracle errors for better diagnosis after passwordChange call
            if (error.code === 'ORA-01017') {
                // This error could occur if getConnection didn't throw it (unlikely, but for safety)
                this.#logger.warn(
                    `Password change failed for user '${username}' on database '${dbName}': Invalid old password provided during passwordChange.`,
                )
                return false
            } else if (error.code === 'ORA-28001') {
                // ORA-28001: the password has expired
                // oracledb.passwordChange can handle this, but we log for info.
                this.#logger.warn(
                    `Password change for user '${username}' on database '${dbName}': Password was already expired, but it was reset.`,
                )
                return true // Consider successful, as oracledb.passwordChange handled it
            } else if (error.code === 'ORA-28008') {
                // ORA-28008: the password has been used recently
                this.#logger.warn(
                    `Password change for user '${username}' on database '${dbName}': New password was used recently.`,
                )
                return false
            }
            this.#logger.error(`Error changing password for user '${username}':`, error)
            throw error
        } finally {
            if (connection) {
                try {
                    await connection.close()
                    this.#logger.debug(
                        `Closed temporary connection after password change for user '${username}'.`,
                    )
                } catch (closeError) {
                    this.#logger.error(
                        `Error closing connection after password change for '${username}':`,
                        closeError,
                    )
                }
            }
        }
    }

    //   ---
    //   ## DBA Methods
    //   ---

    /**
     * Resets the password for any specified database user using administrator privileges.
     * This method assumes that the connection used to call it (or the connection
     * implicitly acquired via dbName if usePool is true) has sufficient privileges
     * (e.g., ALTER USER privilege or DBA role).
     * It does not require knowledge of the user's old password.
     *
     * @param {string} dbName - The name of the database configuration to use (from `config.db`).
     * This configuration should typically point to a database where
     * the connecting user has administrative rights.
     * @param {string} targetUsername - The username of the database user whose password is to be reset.
     * @param {string} newPassword - The new password for the target user.
     * @param {boolean} [usePool=true] - Whether to use a connection from a pool. Defaults to `true`.
     * The pool must be created with administrative credentials.
     * @param {import('oracledb').Connection} [connectionToUse=null] - An optional existing administrative connection to use.
     * @returns {Promise<boolean>} - True if the password was successfully reset, false otherwise.
     * @throws {Error} If the manager is not initialized, the database configuration for `dbName` is not found,
     * or if the connecting user does not have sufficient privileges,
     * or other critical DB errors occur.
     */
    async resetUserPasswordAsAdmin(
        dbName,
        targetUsername,
        newPassword,
        usePool = true,
        connectionToUse = null,
    ) {
        if (!this.#isInitialized) {
            throw new Error('OracleDbManager is not initialized. Call initialize() first.')
        }
        if (!this.config.db[dbName]) {
            throw new Error(
                `Database configuration for '${dbName}' not found for password reset operation.`,
            )
        }

        if (!targetUsername || !newPassword) {
            throw new Error('Target username and new password are required to reset password.')
        }

        let connection = connectionToUse
        let connectionAcquiredLocally = false

        try {
            if (!connection) {
                // Отримуємо з'єднання з пулу або пряме, яке має адмін-права.
                // Важливо: переконайтеся, що конфігурація dbName в config.db
                // використовує користувача з адміністративними привілеями (наприклад, SYS або інший DBA).
                connection = await this.getConnection(dbName, usePool)
                connectionAcquiredLocally = true
                this.#logger.info(`Acquired connection for admin password reset from '${dbName}'.`)
            } else {
                this.#logger.info(
                    `Using provided connection for admin password reset for '${dbName}'.`,
                )
            }

            // SQL-оператор для зміни пароля.
            // Подвійні лапки навколо імені користувача необхідні, якщо ім'я чутливе до регістру
            // або містить спеціальні символи, або просто для більшої надійності.
            const alterSqlTemplate = `ALTER USER "${targetUsername}" IDENTIFIED BY "[REDACTED_PASSWORD]"` // Замінюємо пароль на зірочки для логування
            const actualAlterSql = `ALTER USER "${targetUsername}" IDENTIFIED BY "${newPassword}"` // Фактичний SQL для виконання

            // Виконуємо запит. autoCommit=true, оскільки це DDL-операція.
            const result = await this.profiler(
                () => connection.execute(actualAlterSql, {}, { autoCommit: true }),
                alterSqlTemplate,
                {}, // Немає параметрів для логування, пароль у самому SQL
            )

            // Якщо операція успішна, rowsAffected буде 0 для DDL, але noRowsAffected will be false
            if (result.rowsAffected === 0 || result.rowsAffected === undefined) {
                this.#logger.info(
                    `Password successfully reset for user '${targetUsername}' by administrator on database '${dbName}'.`,
                )
                return true
            } else {
                this.#logger.warn(
                    `Password reset for user '${targetUsername}' by administrator on database '${dbName}' had unexpected rowsAffected: ${result.rowsAffected}`,
                )
                return true // DDL зазвичай повертає 0 affected rows, це нормально
            }
        } catch (error) {
            // Обробка SPECIFIC Oracle errors
            if (error.code === 'ORA-01031') {
                // ORA-01031: insufficient privileges
                this.#logger.error(
                    `Password reset failed for user '${targetUsername}' on database '${dbName}': Insufficient privileges. Ensure the connecting user has ALTER USER privilege.`,
                    error.message,
                )
                throw new Error(
                    `Insufficient privileges to reset password for user '${targetUsername}'.`,
                )
            } else if (error.code === 'ORA-00959') {
                // ORA-00959: tablespace 'string' does not exist
                // Це може статися, якщо ви вказуєте default tablespace, який не існує
                this.#logger.error(
                    `Password reset failed for user '${targetUsername}' on database '${dbName}': Tablespace issue.`,
                    error.message,
                )
                throw error
            } else if (error.code === 'ORA-01918') {
                // ORA-01918: user 'string' does not exist
                this.#logger.error(
                    `Password reset failed for user '${targetUsername}' on database '${dbName}': User '${targetUsername}' does not exist.`,
                    error.message,
                )
                return false // Користувач не існує
            } else {
                this.#logger.error(
                    `Unhandled error resetting password for user '${targetUsername}' on database '${dbName}':`,
                    error.message,
                )
                throw error // Перевикинути інші критичні помилки
            }
        } finally {
            // Закриваємо з'єднання, якщо ми його самі відкрили (не було надано connectionToUse)
            if (connectionAcquiredLocally && connection && usePool) {
                try {
                    connection.autoCommit = this.defaultOptions.autoCommit // Скидаємо autoCommit на значення за замовчуванням перед поверненням до пулу
                    await connection.close()
                    this.#logger.debug(
                        `Closed connection after admin password reset for '${dbName}'.`,
                    )
                } catch (closeError) {
                    this.#logger.error(
                        `Error closing connection after admin password reset for '${dbName}':`,
                        closeError,
                    )
                }
            }
        }
    }
}

export default new OracleDbManager()
