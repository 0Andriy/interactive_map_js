// OracleDbManager.js
import oracledb, { autoCommit } from 'oracledb'
import config from '../config/config.js'

// Простий логгер (можна замінити на більш просунутий)
const logger = {
    info: (...args) => logger.log('[INFO]', ...args),
    error: (...args) => logger.error('[ERROR]', ...args),
    debug: (...args) => logger.debug('[DEBUG]', ...args),
}

class OracleDbManager {
    constructor(config) {
        this.defaultConfig = {
            user: 'admin',
            password: 'admin',
            connectString: 'admin',
            sessionCallback: this.initSession,
        }

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

        this.config = config
        this.oracledb = oracledb
        this.usePool = true

        this.allowedNames = Object.keys(config.db)
        this.connections = {}
        this.pools = {}

        if (config.DriverMode.toLowerCase() === 'thick') {
            oracledb.initOracleClient(config.ClientOpts)
        }
    }

    // 🟡 Ініціалізація сесії (наприклад, встановлення рівня ізоляції)
    async initSession(connection, requestedTag, callbackFn) {
        logger.info(`Init session for tag: ${requestedTag}`)
        await connection.execute(`ALTER SESSION SET ISOLATION_LEVEL = READ COMMITTED`, callbackFn)
    }

    // 🟡 Дозволені бази
    async isDatabaseAllowed(dbName) {
        return this.allowedNames.includes(dbName)
    }

    // 🔧 Підключення до бази
    async connect(dbName, usePool = this.usePool) {
        const dbConfig = { ...this.defaultConfig, ...this.config.db[dbName] }

        if (usePool) {
            const pool = await oracledb.createPool(dbConfig)
            this.pools[dbName] = pool
            logger.info(`Pool created for database: ${dbName}`)
        } else {
            const connection = await oracledb.getConnection(dbConfig)
            this.connections[dbName] = connection
            logger.info(`Connected directly to database: ${dbName}`)
        }
    }

    // 🔧 Закрити підключення або пул
    async close(dbName, usePool = this.usePool) {
        if (usePool) {
            if (this.pools[dbName]) {
                await this.pools[dbName].close()
                delete this.pools[dbName]
                logger.info(`Closed pool for ${dbName}`)
            }
        } else {
            if (this.connections[dbName]) {
                await this.connections[dbName].close()
                delete this.connections[dbName]
                logger.info(`Closed direct connection for ${dbName}`)
            }
        }
    }

    // 🔧 Метод: отримати конекшн (з пулу або напряму)
    async getConnection(dbName, usePool = this.usePool) {
        if (usePool) {
            if (!this.pools[dbName]) throw new Error(`No pool for database ${dbName}`)
            return await this.pools[dbName].getConnection()
        } else {
            const conn = this.connections[dbName]
            if (!conn) throw new Error(`No direct connection for database ${dbName}`)
            return conn
        }
    }

    // 🔧 Метод: об'єднати дефолтні та користувацькі опції, з пріоритетом користувача
    async mergeOptions(userOptions = {}) {
        const options = { ...this.defaultOptions, ...userOptions }

        const defaultHandler = this.defaultOptions.fetchTypeHandler
        const userHandler = userOptions.fetchTypeHandler

        // Якщо користувач не вказав свій fetchTypeHandler — беремо дефолт
        if (!userHandler) return options

        // Комбінована обробка fetchTypeHandler
        options.fetchTypeHandler = (metaData) => {
            const userResult = userHandler(metaData)
            // Якщо користувач явно щось повернув — беремо це
            if (userResult !== undefined) return userResult
            // Інакше — повертаємо дефолтне значення
            return defaultHandler ? defaultHandler(metaData) : undefined
        }

        return options
    }
    // 🔧 Профілювання запитів (SQL + час + params)
    async profile(fn, sql, params) {
        const start = process.hrtime.bigint()
        // const start = Date.now()
        const result = await fn()
        const end = process.hrtime.bigint()
        // const end = Date.now()

        const durationMs = Number(end - start) / 1_000_000

        logger.info(
            `[ORACLE EXECUTE][${durationMs.toFixed(2)} ms] Script: ${sql}, Params: ${JSON.stringify(
                params,
            )}`,
        )
        return result
    }

    // 🔵 Виконання звичайного запиту
    async execute(dbName, sql, params = {}, options = {}, usePool = this.usePool) {
        let connection
        try {
            const generalOptions = await this.mergeOptions(options)
            connection = await this.getConnection(dbName, usePool)

            const result = await this.profile(
                () => connection.execute(sql, params, generalOptions),
                sql,
                params,
            )

            return result
        } catch (error) {
            throw new Error(`Error executing query: ${sql} \n${error}`)
        } finally {
            if (connection && usePool) {
                try {
                    await connection.close()
                } catch (error) {
                    logger.error(`Error closing connection`, error)
                }
            }
        }
    }

    // 🔵 Виконання batch-запитів (insert/update many)
    async executeMany(dbName, sql, binds = [], options = {}, usePool = this.usePool) {
        let connection
        try {
            const generalOptions = await this.mergeOptions(options)
            connection = await this.getConnection(dbName, usePool)

            const result = await this.profile(
                () => connection.executeMany(sql, binds, generalOptions),
                sql,
                binds,
            )

            return result
        } catch (error) {
            throw new Error(`Error executing queryMany: ${sql} \n${error}`)
        } finally {
            if (connection && usePool) {
                try {
                    await connection.close()
                } catch (error) {
                    logger.error(`Error closing connection`, error)
                }
            }
        }
    }

    // 🧾 Транзакція з rollback/push-back логікою
    async executeInTransaction(dbName, callback, usePool = this.usePool) {
        const connection = await this.getConnection(dbName, usePool)

        try {
            logger.info(`Transaction started.....`)
            // Явно починаємо транзакцію (можна і без цього, Oracle не вимагає BEGIN)
            // await connection.execute('BEGIN') // ← опціонально

            const result = await callback(connection)

            await connection.commit()

            logger.info(`Transaction committed.`)

            return result
        } catch (error) {
            if (connection) {
                await connection.rollback()
                logger.error(`Transaction rolled back due to error: ${error.message}`)
            }

            throw error
        } finally {
            if (connection && usePool) {
                await connection.close()
            }
        }
    }

    // Метод execute, що дозволяє явно виконати запит з конкретним connection (для транзакцій)
    async executeWithConnection(connection, sql, params = {}, options = {}) {
        const generalOptions = { ...this.defaultOptions, ...options, autoCommit: false }
        const result = await this.profile(
            () => connection.execute(sql, params, generalOptions),
            sql,
            params,
        )
        return result
    }
}

export default new OracleDbManager(config.oracleDB)

// <==================================================================>
const db = new OracleDbManager(config.oracleDB)

// Транзакція
await db.executeInTransaction('main', async (conn) => {
    await conn.execute(`INSERT INTO logs (id, msg) VALUES (:id, :msg)`, { id: 99, msg: 'Test' })
    // await db.executeWithConnection(conn, `INSERT INTO logs (id, msg) VALUES (:id, :msg)`, {
    //     id: 99,
    //     msg: 'Test',
    // })
    await conn.execute(`UPDATE users SET active = 1 WHERE id = :id`, { id: 99 })
    // await db.executeWithConnection(conn, `UPDATE users SET active = 1 WHERE id = :id`, { id: 99 })
})
