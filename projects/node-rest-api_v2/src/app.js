import config from './config/config.js'

// server
import http from 'http'
import https from 'https'
// api
import express from 'express'
// ws - WebSocket
import WebSocketManager from './websockets/WebSocketManager.js'
import wsHandlers from './websockets/handlers.js'

//
import cors from 'cors'
import cookieParser from 'cookie-parser'
import compression from 'compression'
import fs from 'fs/promises' // Для асинхронних файлових операцій
import path from 'path' // Для роботи зі шляхами

// Logger
import logger from './utils/logger.js'
// Database
import oracleDbManager from './db/OracleDbManager2.js'
// JWT
import JwtManager from './utils/JwtManager.js'
// Swagger
import swaggerDocs from './utils/swagger.js'

// Middleware (проміжне ПЗ)
import errorHandling from './middleware/globalErrorHandler.js'
import { requestContextMiddleware } from './middleware/requestContext.js'
import morganMiddleware from './middleware/morganMiddleware.js'
import forceHttps from './middleware/forceHttps.js'

// Endpoints (роутери)
import basicRouter from './routes/v1/basic/basic.route.js'
import authRouter from './routes/v1/auth/auth.route.js'

// <=======================================================================>
// <=======================================================================>
// <=======================================================================>

// Створюємо екземпляр додатку
const app = express()

// <=======================================================================>
// <=====================  Middleware Setup ===============================>
// <=======================================================================>

// Middleware для додавання requestId і correlationId
app.use(requestContextMiddleware)
// Підключає middleware для стиснення відповідей (зменшує обсяг переданих даних)
app.use(compression(config.getCompressionOptions()))
// logger http request
app.use(morganMiddleware)
// redirect http to https if use HTTPS
app.use(forceHttps(config.server.useHttps))
// To support JSON-encoded bodies -- Для того щоб Express розумів JSON в request.body
app.use(express.json())
// To support URL-encoded bodies
app.use(express.urlencoded({ extended: true }))
app.use(cors(config.getCorsOptions()))
app.use(cookieParser())

// Swagger (OpenAPI) Documentation
if (config.server.useHttps) {
    swaggerDocs(app, config.server.ports.https, config.server.host, 'https', logger)
} else if (config.server.useHttp) {
    // Якщо HTTPS не використовується, то HTTP
    swaggerDocs(app, config.server.ports.http, config.server.host, 'http', logger)
}

// <=======================================================================>
// <=====================   Static Files Setup    =========================>
// <=======================================================================>

// Додаємо роздачу статичних файлів (зображення, стилі, скрипти) з папки 'public'
async function addStaticFiles(folderPath = 'public') {
    // Шлях до папки зі статичними файлами
    const staticFolderPath = path.resolve(process.cwd(), folderPath)

    try {
        // Перевіряємо доступність папки
        await fs.access(staticFolderPath)
        // Якщо папка існує, налаштовуємо роздачу статичних файлів
        app.use(express.static(staticFolderPath))
        logger.info(`Serving static files from: ${staticFolderPath}`)
    } catch (error) {
        logger.warn(
            `Static folder "${staticFolderPath}" not found or inaccessible. Static files will not be served from this path.`,
        )
    }
}
await addStaticFiles('public')

// <=======================================================================>
// <========================== Routes (endpoints) =========================>
// <=======================================================================>

/**
 * @swagger
 * /favicon.ico:
 *   get:
 *     tags:
 *       - General
 *     summary: Запит іконки сайту (favicon)
 *     description: Браузери автоматично роблять запит на цей ендпоінт для отримання іконки сайту.
 *     responses:
 *       204:
 *         description: Успішна відповідь без вмісту. Запит на іконку сайту оброблено, контент не повертається.
 */
app.get('/favicon.ico', (req, res) => {
    // Відправляємо статус 204 No Content.
    // Це означає, що запит був успішно оброблений, але відповідь не містить тіла.
    // Браузери розуміють це і не намагаються завантажити іконку повторно.
    res.status(204).end()
})

// basic
app.use('/api/v1/', basicRouter)

// auth
app.use('/api/v1/auth', authRouter)

// <=======================================================================>
// <================   404 - Not Found Handler  ===========================>
// <=======================================================================>

// Цей middleware спрацює, якщо жоден з попередніх маршрутів або middleware
// не обробив запит.
app.use((req, res, next) => {
    logger.warn(`404 Not Found: ${req.method} ${req.originalUrl}`)
    // Створюємо об'єкт помилки з HTTP статусом 404
    const error = new Error(`Resource not found: ${req.originalUrl}`)
    error.status = 404
    // Передаємо помилку до наступного middleware, який є обробником помилок
    next(error)
})

// <=======================================================================>
// <================  Error handling middleware (Global)  =================>
// <=======================================================================>

// Цей middleware ЗАВЖДИ має бути останнім у вашому ланцюжку.
// Він перехоплює всі помилки, що були передані через `next(error)`.
app.use(errorHandling)

// <=======================================================================>
// <=========================  HTTP(S) server  ============================>
// <=======================================================================>
function createAndRunServer(protocol, port, host) {
    let server = null
    let serverType = null
    if (protocol === 'https') {
        server = https.createServer(config.getSslOptions(), app)
        serverType = 'HTTPS'
    } else {
        server = http.createServer(app)
        serverType = 'HTTP'
    }

    server.listen(port, host, () => {
        logger.info(`${serverType} Server is running => ${protocol}://${host}:${port}`)
    })

    // Додайте обробку помилок сервера
    server.on('error', (error) => {
        logger.error(`Error starting ${serverType} server on port ${port}:`, error)
        process.exit(1) // Завершити процес у разі критичної помилки
    })

    return server
}

// <=======================================================================>
// <=========================  Run App  ===================================>
// <=======================================================================>
async function initApp() {
    // <=======================================================================>
    // <======================  Connect to database  ==========================>
    // <=======================================================================>
    await oracleDbManager.initialize(config.oracleDB, logger)
    await oracleDbManager.connect('TEST')

    // <=======================================================================>
    // <==================  Create and settings JWT  =========================>
    // <=======================================================================>
    config.tokenTypes.access.loader = async (keyId) => {
        const sqlScript = `begin
                            :key := BASE_OBJ.SSO_PKG.get_s_key_f(1,1);
                        end;`
        const sqlParams = {
            key: { dir: oracleDbManager.oracledb.BIND_OUT, type: oracleDbManager.oracledb.STRING },
        }

        const result = (await oracleDbManager.execute('TEST', sqlScript, sqlParams)).outBinds.key
        return {
            key: result,
        }
    }

    config.tokenTypes.refresh.loader = async (keyId) => {
        const sqlScript = `begin
                            :key := BASE_OBJ.SSO_PKG.get_s_key_f(2,2);
                        end;`
        const sqlParams = {
            key: { dir: oracleDbManager.oracledb.BIND_OUT, type: oracleDbManager.oracledb.STRING },
        }

        const result = (await oracleDbManager.execute('TEST', sqlScript, sqlParams)).outBinds.key
        return {
            key: result,
        }
    }

    const jwtManager = new JwtManager(config.tokenTypes, logger)
    console.log(await jwtManager.getKey('access'))
    console.log(await jwtManager.getKey('refresh'))

    const userPayload = {
        userId: '12345',
        role: 'admin',
        username: 'john.doe',
    }
    // const accessToken = await jwtManager.sign(userPayload, 'access', {
    //     iat: Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000),
    //     exp: Math.floor((Date.now() - 1 * 60 * 60 * 1000) / 1000),
    // })
    // console.log(1, accessToken)

    // const verifyToken = await jwtManager.verify(accessToken, 'access')
    // console.log(2, verifyToken)

    // <=======================================================================>
    // <===============  Run and settings HTTP Server  ========================>
    // <=======================================================================>
    let httpServer = null,
        httpsServer = null,
        serversToListen = []

    if (config.server.useHttp) {
        httpServer = createAndRunServer('http', config.server.ports.http, config.server.host)
        serversToListen.push(httpServer)
    }

    // <=======================================================================>
    // <==============  Run and settings HTTPS Server  ========================>
    // <=======================================================================>
    if (config.server.useHttps) {
        httpsServer = createAndRunServer('https', config.server.ports.https, config.server.host)
        serversToListen.push(httpsServer)
    }

    // <=======================================================================>
    // <==============  Ініціалізація WebSocketManager  =======================>
    // <=======================================================================>
    const myAuthService = {
        verifyToken: async (token) => {
            console.log(`[AuthService] Перевірка токена: ${token}`)
            await new Promise((resolve) => setTimeout(resolve, 100)) // Імітуємо затримку
            if (token === 'valid_user_token_123') {
                return {
                    isValid: true,
                    payload: { userId: 'user_123', roles: ['admin', 'user'] },
                }
            }
            if (token === 'valid_user_token_456') {
                return { isValid: true, payload: { userId: 'user_456', roles: ['user'] } }
            }
            // Токен для тестування адміністративних функцій (наприклад, adminCommand)
            if (token === 'valid_admin_token_789') {
                return {
                    isValid: true,
                    payload: { userId: 'admin_789', roles: ['admin', 'user'] },
                }
            }
            return { isValid: false, payload: null }
        },
    }

    const websocketManagerInstance = new WebSocketManager(httpServer, {
        config: config,
        logger: logger,
        dbService: wsHandlers,
        authService: myAuthService,
    })

    // <=======================================================================>
    // <====================  Graceful shutdown  ==============================>
    // <=======================================================================>
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.on(signal, async (receivedSignal) => {
            logger.info(`${receivedSignal} received. Shutting down gracefully...`)

            if (oracleDbManager) {
                await oracleDbManager.closeAllConnections()
                logger.info('Oracle DB connections closed.')
            }
            process.exit(0)
        })
    }
}

// <=======================================================================>
// <============================  Run   ===================================>
// <=======================================================================>
//
initApp()
