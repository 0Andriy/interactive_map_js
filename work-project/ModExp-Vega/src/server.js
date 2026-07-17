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
import { Server as WebSocketServer } from './modules/ws/core/Server.js'

/**
 * Ініціалізує та запускає HTTP/HTTPS сервер разом із WebSocket інстансом
 */
async function bootstrapServer(protocol, port, host, appModules = {}) {
    const isHttps = protocol === 'https'
    const server = isHttps ? https.createServer(config.getSslOptions()) : http.createServer()

    const webSocketServer = new WebSocketServer(server, {
        logger,
    })

    const expressApp = await createExpressApp({
        wss: webSocketServer,
        ...appModules,
    })
    // Прив'язка Express-додатку до сервера
    server.on('request', expressApp)

    // запуск сервера
    server.listen(port, host, () => {
        const actualHost = host || config.getLocalIp() || 'localhost'
        logger?.info?.(
            `${protocol.toUpperCase()} Server is running at ${protocol}://${actualHost}:${port}`,
        )
    })

    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            logger?.error?.(`Port ${port} is already in use. Exiting...`)
        } else {
            logger?.error?.(`Critical server error on ${protocol.toUpperCase()}:`, error)
        }
        process.exit(1)
    })

    return {
        serverInstance: server,
        wsInstance: webSocketServer,
    }
}

/**
 * Головна функція ініціалізації всього додатку
 */
async function initializeApplication() {
    // --------------  Ініціалізація Oracle Database  -----------------------
    const dbManager = new OracleDatabaseManager(logger)

    // Реєструємо бази даних
    await dbManager.register('TEST', config.oracleDB.connections['TEST'], {
        thickModeOptions: config.oracleDB.thickModeOptions,
    })

    const isDbHealthy = await dbManager.get('TEST').isHealthy()
    logger?.info?.(`Database health check result: ${isDbHealthy}`)

    // -------------------  Ініціалізація JWT  ------------------------------
    config.tokenTypes.access.keyProvider = async (context, payload, operation) => {
        const dbAlias = context.dbAlias || config.oracleDB.primaryDatabaseName
        const cacheId = `jwt:access:${dbAlias}`
        const CACHE_TTL = 1000 * 60 * 5

        try {
            return await keyCache.getOrFetch(cacheId, CACHE_TTL, async () => {
                const db = dbManager.get(dbAlias)
                if (!db) throw new Error(`Database [${dbAlias}] not found`)

                const sqlScript = `
                    SELECT
                        S_KEY
                    FROM base_obj.get_access_s_key
                `
                const result = await db.execute(sqlScript)

                // Перевіряємо, чи повернулися рядки
                if (!result?.rows || result.rows.length === 0) {
                    throw new Error('Access key not found in db')
                }

                // Отримуємо значення ключа (залежно від outFormat)
                const row = result.rows[0]
                const secretKey = Array.isArray(row) ? row[0] : row.S_KEY

                if (!secretKey) throw new Error('Key field is empty')

                // Повертаємо об'єкт, який JwtService очікує (secret)
                return { secret: secretKey }
            })
        } catch (error) {
            logger?.error?.(
                `[JWT AUTH ERROR] Database failure for ${dbAlias}: ${error.message}`,
                error,
            )

            // Повертаємо null або викидаємо контрольовану помилку
            // Це зупинить лише цей конкретний запит, а не весь додаток
            throw new Error('AUTH_TOKEN_PROVIDER_UNAVAILABLE')
        }
    }

    config.tokenTypes.refresh.keyProvider = async (context, payload, operation) => {
        const dbAlias = context.dbAlias || config.oracleDB.primaryDatabaseName
        const cacheId = `jwt:refresh:${dbAlias}`
        const CACHE_TTL = 1000 * 60 * 5

        try {
            return await keyCache.getOrFetch(cacheId, CACHE_TTL, async () => {
                const db = dbManager.get(dbAlias)
                if (!db) throw new Error(`Database [${dbAlias}] not found`)

                const sqlScript = `
                    SELECT
                        S_KEY
                    FROM base_obj.get_refresh_s_key
                `
                const result = await db.execute(sqlScript)

                // Перевіряємо, чи повернулися рядки
                if (!result?.rows || result.rows.length === 0) {
                    throw new Error('Key not found in Oracle View')
                }

                // Отримуємо значення ключа (залежно від outFormat)
                const row = result.rows[0]
                const secretKey = Array.isArray(row) ? row[0] : row.S_KEY

                if (!secretKey) throw new Error('Key field is empty')

                // Повертаємо об'єкт, який JwtService очікує (secret)
                return { secret: secretKey }
            })
        } catch (error) {
            logger?.error?.(
                `[JWT AUTH ERROR] Database failure for ${dbAlias}: ${error.message}`,
                error,
            )

            // Повертаємо null або викидаємо контрольовану помилку
            // Це зупинить лише цей конкретний запит, а не весь додаток
            throw new Error('AUTH_TOKEN_PROVIDER_UNAVAILABLE')
        }
    }

    const jwtManager = new JwtManager()
    await jwtManager.initialize(config.tokenTypes)

    // const accessService = jwtManager.use('access')
    // const userPayload = {
    //     userId: '12345',
    //     role: 'admin',
    //     username: 'john.doe',
    // }

    // const accessToken = await accessService.sign(userPayload, {})
    // console.log(1, accessService, accessToken)

    // const verifyToken = await accessService.verify(accessToken)
    // console.log(2, verifyToken)

    // <=======================================================================>
    // const dbManager = null
    // const jwtManager = null

    const appModules = {
        dbManager,
        jwtManager,
    }

    const activeServers = []
    const activeWebSockets = []

    // Запуск HTTP сервера
    if (config.server.useHttp) {
        const { serverInstance, wsInstance } = await bootstrapServer(
            'http',
            config.server.ports.http,
            config.server.host,
            appModules,
        )
        activeServers.push(serverInstance)
        activeWebSockets.push(wsInstance)
    }

    // Запуск HTTPS сервера
    if (config.server.useHttps) {
        const { serverInstance, wsInstance } = await bootstrapServer(
            'https',
            config.server.ports.https,
            config.server.host,
            appModules,
        )
        activeServers.push(serverInstance)
        activeWebSockets.push(wsInstance)
    }

    /**
     * Безпечне завершення роботи всіх компонентів системи
     */
    let isShuttingDown = false
    async function handleGracefulShutdown(signal) {
        if (isShuttingDown) return
        isShuttingDown = true

        logger?.info?.(`${signal} received. Shutting down gracefully...`)

        // Встановлюємо примусовий таймаут завершення
        const forceExitTimeout = setTimeout(() => {
            logger?.error?.('Graceful shutdown timed out. Forcing exit.')
            process.exit(1)
        }, 1000 * 10)

        try {
            // 1. Зупиняємо HTTP/HTTPS сервери (припиняємо прийом нових запитів)
            for (const server of activeServers) {
                logger?.info?.(`Closing server on port ${server.address()?.port}...`)

                // Спершу закриваємо сокети без активних запитів (Node.js 18.2+)
                if (typeof server.closeIdleConnections === 'function') {
                    server.closeIdleConnections()
                }

                await new Promise((resolve) => {
                    // Встановлюємо внутрішній таймаут суто для цього сервера
                    const t = setTimeout(resolve, 3000)

                    server.close(() => {
                        clearTimeout(t)
                        resolve()
                    })
                })
            }
            logger?.info?.('All HTTP/HTTPS servers successfully closed.')

            // 2. Закриваємо активні WebSocket сервери та їхніх клієнтів
            for (const wss of activeWebSockets) {
                if (wss && typeof wss.close === 'function') {
                    logger?.info?.('Terminating WS clients and closing WS server...')

                    // 2.1. Примусово закриваємо всіх підключених клієнтів цього сервера
                    if (wss.clients) {
                        for (const client of wss.clients) {
                            // Використовуємо terminate(), бо close() чекає на відповідне рукостискання
                            client.terminate()
                        }
                    }

                    // 2.2. Очікуємо повного закриття самого сервера через Promise
                    await new Promise((resolve) => {
                        const t = setTimeout(() => {
                            logger?.warn?.('WS server close timed out. Moving on.')
                            resolve()
                        }, 2000) // Локальний таймаут для безпеки

                        wss.close(() => {
                            clearTimeout(t)
                            resolve()
                        })
                    })
                }
            }
            logger?.info?.('All WebSocket servers successfully closed.')

            // 3. Закриваємо з'єднання з базою даних Oracle
            // 3. Закриваємо пули з'єднань з Oracle DB
            if (dbManager) {
                logger?.info?.('Closing Oracle DB connection pools...')
                // Всередині closeAll() використовується pool.close(0) або pool.close(2)
                await dbManager.closeAll()
                logger?.info?.('Oracle DB connections closed.')
            }

            clearTimeout(forceExitTimeout)
            logger?.info?.('Graceful shutdown complete. Exiting clean.')
            process.exit(0)
        } catch (err) {
            // Синхронний вивід для гарантії відображення в терміналі при краші
            console.error('⛔ КРИТИЧНА ПОМИЛКА ПІД ЧАС ЗУПИНУ:', err)
            logger?.error?.('Error during graceful shutdown:', err)
            process.exit(1)
        }
    }

    // Підписуємося на сигнали правильно — обидва викличуть ОДНУ й ту саму функцію
    process.on('SIGINT', () => handleGracefulShutdown('SIGINT'))
    process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'))
}

// Запуск додатку
await initializeApplication()
