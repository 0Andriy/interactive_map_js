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
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import fs from 'fs/promises' // Для асинхронних файлових операцій
import path from 'path' // Для роботи зі шляхами

// Logger
import logger from './utils/logger.js'
// Database
import oracleDbManager from './db/OracleDbManager.js'
// JWT
import jwtManager from './utils/JwtManager.js'
// Swagger
import swaggerDocs from './utils/swagger.js'

// Middleware (проміжне ПЗ)
import errorHandling from './middleware/globalErrorHandler.js'
import forceHttps from './middleware/forceHttps.js'
import { loggingUserResolver } from './middleware/loggingUserResolver.js'
import { requestContextMiddleware } from './middleware/requestContext.js'
import morganMiddleware from './middleware/morganMiddleware.js'

// Endpoints (роутери)
import apiV1Routes from './routes/v1/index.js'

// <=======================================================================>
// <=======================================================================>
// <=======================================================================>

// Створюємо екземпляр додатку
const app = express()

// <=======================================================================>
// <=====================  Middleware Setup ===============================>
// <=======================================================================>

// --- 1. Ранні middleware для безпеки та продуктивності ---
// Ці middleware мають працювати якомога раніше, щоб забезпечити базовий захист
// та обробку мережевих запитів.

// Middleware для перенаправлення HTTP на HTTPS
// Цей middleware повинен бути одним з перших, якщо використовується HTTPS,
// щоб переконатися, що всі запити обробляються захищеним протоколом.
app.use(forceHttps(config.server.useHttps))

// Додає різні HTTP-заголовки для підвищення безпеки.
// Працює на рівні заголовків, тому повинен бути дуже раннім.
// Застосовуйте Helmet до всього, КРІМ шляхів Swagger UI
app.use((req, res, next) => {
    // Якщо запит стосується Swagger UI або його JSON-специфікації,
    // пропустити застосування Helmet
    if (
        req.path === '/api-docs' ||
        req.path === '/api-docs.json' ||
        req.path.startsWith('/api-docs/')
    ) {
        return next()
    }
    // В іншому випадку, застосувати Helmet
    helmet()(req, res, next)
})

// Підключає middleware для стиснення відповідей (зменшує обсяг переданих даних).
// Стиснення має відбуватися до того, як дані відправляться по мережі,
// тому його теж варто поставити досить рано.
app.use(compression(config.getCompressionOptions()))

// Middleware для додавання requestId і correlationId.
// Добре розмістити його рано, щоб correlationId був доступний для всіх наступних логів та обробки.
app.use(requestContextMiddleware)

// Налаштування CORS (Cross-Origin Resource Sharing).
// Важливо, щоб CORS був налаштований до того, як почнете обробляти маршрути,
// оскільки він впливає на дозвіл доступу до API з інших доменів.
app.use(cors(config.getCorsOptions()))

// --- 2. Парсери тіла запиту ---
// Ці middleware парсять вхідні дані з тіла запиту, роблячи їх доступними в `req.body`.
// Вони мають бути перед будь-якими middleware або маршрутами, які потребують доступу до `req.body`.

// Для парсингу JSON-кодованих тіл запитів.
app.use(express.json())

// Для парсингу URL-кодованих тіл запитів.
app.use(express.urlencoded({ extended: true }))

// Для парсингу Cookie.
// Потрібно, якщо зчитуєте токени або інші дані з cookie.
app.use(cookieParser())

// --- 3. Логування та обробка контексту користувача ---
// Ці middleware отримують і обробляють інформацію, яка буде використовуватися для логування
// або подальшої авторизації.

// Отримує інформацію про користувача з токенів без сторонніх бібліотек (декодування JWT).
// Він повинен працювати після парсерів (оскільки може читати з body або cookies)
// і перед Morgan, щоб Morgan міг використовувати `req.logUserContext`.
app.use(loggingUserResolver)

// Middleware для логування HTTP-запитів.
// Morgan повинен бути після `loggingUserResolver`, щоб мати доступ до `req.logUserContext`.
// Його також бажано поставити перед Rate Limiter, щоб логувати спроби, які будуть відхилені лімітером.
app.use(morganMiddleware)

// --- 4. Обмеження частоти запитів (Rate Limiting) ---
// Цей middleware обмежує кількість запитів і має бути перед вашими основними маршрутами,
// але після логування, щоб відхилені запити теж були залогівані.

// Обмеження на 100 запитів з одного IP протягом 15 хвилин.
// Застосовується до всіх API-маршрутів. Розмістіть його після логування,
// але до вашої основної логіки маршрутів.
// const apiLimiter = rateLimit({
//     windowMs: 15 * 60 * 1000, // 15 хвилин
//     max: 100, // Максимум 100 запитів
//     message: 'Забагато запитів з цієї IP-адреси, спробуйте пізніше.',
//     standardHeaders: true, // Повертає заголовки X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
//     legacyHeaders: false, // Відключає заголовки X-Powered-By
// })
// app.use('/api/', apiLimiter) // Припустимо, що API маршрути починаються з '/api/'

// --- 5. Налаштування документації (Swagger) ---
// Документація API може бути налаштована на цьому етапі.
// Важливо, щоб маршрути для Swagger не були обмежені rate limiter, якщо хочете,
// щоб до них був вільний доступ.

// Swagger (OpenAPI) Documentation.
// Розмістіть після основних middleware, але перед вашими головними маршрутами API.
// Переконайтесь, що маршрути Swagger не блокуються вашим `apiLimiter`, якщо це потрібно.
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

// router - v1
app.use('/api/v1', apiV1Routes)

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
    // <================  Ініціалізація Oracle Database  ======================>
    // <=======================================================================>
    await oracleDbManager.initialize(config.oracleDB, logger)
    await oracleDbManager.connect('TEST')

    // <=======================================================================>
    // <========================  Ініціалізація JWT  ==========================>
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

    await jwtManager.initialize(config, logger)
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
    // <===============  Ініціалізація HTTP Server  ===========================>
    // <=======================================================================>
    let httpServer = null,
        httpsServer = null,
        serversToListen = []

    if (config.server.useHttp) {
        httpServer = createAndRunServer('http', config.server.ports.http, config.server.host)
        serversToListen.push(httpServer)
    }

    // <=======================================================================>
    // <=================  Ініціалізація HTTPS Server  ========================>
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

    // const websocketManagerInstance = new WebSocketManager(httpServer, {
    //     config: config,
    //     logger: logger,
    //     dbService: wsHandlers,
    //     authService: myAuthService,
    // })

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
