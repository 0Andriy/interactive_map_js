// server
import http from 'http'
import https from 'https'

import config from './config/config.js'
// Logger
import { logger } from './common/logger/logger.js'
// Database
import { OracleDatabaseManager } from './common/db/oracle/OracleDatabaseManager.js'
// JWT
import { JwtManager } from './common/jwt/JwtManager.js'
import { keyCache } from './common/utils/KeyCache.js'

// api
import { createExpressApp } from './app.js'

// ws - WebSocket
// import { initializeWebSocketServices, roomManager } from './ws/index.js'

// <=======================================================================>
// <=========================  HTTP(S) server  ============================>
// <=======================================================================>
async function createAndRunServer(protocol, port, host) {
    let server = null

    // <=======================================================================>
    // <======== Створення відповідного сервера (HTTP або HTTPS) ==============>
    // <=======================================================================>
    if (protocol === 'https') {
        const sslOptions = config.getSslOptions()
        server = https.createServer(sslOptions)
    } else {
        server = http.createServer()
    }

    // <=======================================================================>
    // <==============  Ініціалізація WebSocketManager  =======================>
    // <=======================================================================>
    // const wssApp = initializeWebSocketServices(server)

    // <=======================================================================>
    // <======================  Create Express App  ===========================>
    // <=======================================================================>
    const expressApp = await createExpressApp()
    // Прив'язка Express-додатку до сервера
    server.on('request', expressApp)

    // <=======================================================================>
    // <====================== Запуск сервера  ===========================>
    // <=======================================================================>
    server.listen(port, host, () => {
        const protocolUpper = protocol.toUpperCase()
        const actualHost = host || config.getLocalIp() || 'localhost'

        logger?.info?.(`${protocolUpper} Server is running at ${protocol}://${actualHost}:${port}`)
    })

    // Додайте обробку помилок сервера
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            logger?.error?.(`Port ${port} is already in use. Exiting...`)
        } else {
            logger?.error?.(`Critical server error:`, error)
        }
        process.exit(1)
    })

    return server
}

// -----------------------      Run App        ------------------------------
async function initApp() {
    // --------------  Ініціалізація Oracle Database  -----------------------
    const dbManager = new OracleDatabaseManager(logger)

    // Реєструємо бази даних
    await dbManager.register('TEST', config.oracleDB.connections['TEST'], {
        thickModeOptions: config.oracleDB.thickModeOptions,
    })

    
    const isHealthy = await dbManager.get('TEST').isHealthy()
    console.log('Database health check result:', isHealthy)

    // -------------------  Ініціалізація JWT  ------------------------------
    config.tokenTypes.access.keyProvider = async (context, payload, operation) => {
        // return {
        //     secret: 'access_key_placeholder',
        // }

        const dbAlias = context.dbAlias || config.oracleDB.primaryDatabaseName
        const cacheId = `jwt:access:${dbAlias}`
        const CACHE_TTL = 1 * 1000 * 60 * 5

        try {
            return await keyCache.getOrFetch(cacheId, CACHE_TTL, async () => {
                const db = dbManager.get(dbAlias)
                if (!db) throw new Error(`Database [${dbAlias}] not found`)

                const sqlScript = `begin :key := BASE_OBJ.SSO_PKG.get_s_key_f(1, 1); end;`
                const sqlParams = {
                    key: {
                        dir: db.oracledb.BIND_OUT,
                        type: db.oracledb.STRING,
                        maxSize: 4000,
                    },
                }

                const result = await db.execute(sqlScript, sqlParams)

                if (!result?.outBinds?.key) throw new Error('Key not found in Oracle')

                // Повертаємо об'єкт, який JwtService очікує (secret)
                return { secret: result.outBinds.key }
            })
        } catch (error) {
            logger?.error?.(`[JWT AUTH ERROR] Database failure for ${dbAlias}:`, error.message)

            // Повертаємо null або викидаємо контрольовану помилку
            // Це зупинить лише цей конкретний запит, а не весь додаток
            throw new Error('AUTH_PROVIDER_UNAVAILABLE')
        }
    }

    config.tokenTypes.refresh.keyProvider = async (context, payload, operation) => {
        // return {
        //     secret: 'refresh_key_placeholder',
        // }

        const dbAlias = context.dbAlias || config.oracleDB.primaryDatabaseName
        const cacheId = `jwt:refresh:${dbAlias}`
        const CACHE_TTL = 1 * 1000 * 60 * 5

        try {
            return await keyCache.getOrFetch(cacheId, CACHE_TTL, async () => {
                const db = dbManager.get(dbAlias)
                if (!db) throw new Error(`Database [${dbAlias}] not found`)

                const sqlScript = `begin :key := BASE_OBJ.SSO_PKG.get_s_key_f(2, 2); end;`
                const sqlParams = {
                    key: {
                        dir: db.oracledb.BIND_OUT,
                        type: db.oracledb.STRING,
                        maxSize: 4000,
                    },
                }

                const result = await db.execute(sqlScript, sqlParams)

                if (!result?.outBinds?.key) throw new Error('Key not found in Oracle')

                return { secret: result.outBinds.key }
            })
        } catch (error) {
            logger?.error?.(`[JWT AUTH ERROR] Database failure for ${dbAlias}:`, error.message)

            // Повертаємо null або викидаємо контрольовану помилку
            // Це зупинить лише цей конкретний запит, а не весь додаток
            throw new Error('AUTH_PROVIDER_UNAVAILABLE')
        }
    }

    const jwtManager = new JwtManager()
    await jwtManager.initialize(config.tokenTypes)

    // const userPayload = {
    //     userId: '12345',
    //     role: 'admin',
    //     username: 'john.doe',
    // }
    // const access = jwtManager.use('access')

    // const accessToken = await access.sign(userPayload, {})
    // console.log(1, accessToken)

    // const verifyToken = await access.verify(accessToken)
    // console.log(2, verifyToken)

    // <=======================================================================>
    // <======================  Запуск HTTP Server  ===========================>
    // <=======================================================================>
    let httpServer = null
    if (config.server.useHttp) {
        httpServer = await createAndRunServer('http', config.server.ports.http, config.server.host)
    }

    // <=======================================================================>
    // <=================  Ініціалізація HTTPS Server  ========================>
    // <=======================================================================>
    let httpsServer = null
    if (config.server.useHttps) {
        httpsServer = await createAndRunServer(
            'https',
            config.server.ports.https,
            config.server.host,
        )
    }

    // <=======================================================================>
    // <====================  Graceful shutdown  ==============================>
    // <=======================================================================>
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.on(signal, async (receivedSignal) => {
            logger?.info?.(`${receivedSignal} received. Shutting down gracefully...`)

            // Встановлюємо примусовий таймаут завершення (наприклад, 10 секунд)
            const forceExitTimeout = setTimeout(() => {
                logger?.error?.('Graceful shutdown timed out. Forcing exit.')
                process.exit(1)
            }, 10000)

            try {
                // 1. Зупиняємо прийом нових запитів (якщо є HTTP сервер)
                if (httpServer) {
                    await httpServer.close()
                }

                if (httpsServer) {
                    await httpsServer.close()
                }

                // 2. Закриваємо WebSocket (якщо є)
                // if (wssApp) await wssApp.close()

                // 2. Закриваємо з'єднання з базою даних
                if (dbManager) {
                    await dbManager.closeAll()
                    logger?.info?.('Oracle DB connections closed.')
                }

                clearTimeout(forceExitTimeout)
                process.exit(0)
            } catch (err) {
                logger?.error?.('Error during graceful shutdown:', err)
                process.exit(1)
            }
        })
    }
}

// <=======================================================================>
// <============================  Run   ===================================>
// <=======================================================================>
await initApp()
