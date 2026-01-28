import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import fs from 'fs'
import path from 'path'

import config from './config/config.js'
// Logger
import logger from './common/logger/logger.js'
// dbManager
import { OracleDatabaseManager } from './common/db/oracle/OracleDatabaseManager.js'
// Swagger
import swaggerDocs from './common/utils/swagger.js'

// Middleware (проміжне ПЗ)
import errorHandling from './common/middleware/globalErrorHandler.js'
import forceHttps from './common/middleware/forceHttps.js'
import { userResolver } from './common/middleware/userResolver.js'
import { requestContextMiddleware } from './common/middleware/requestContext.js'
import morganMiddleware from './common/middleware/morganMiddleware.js'
import dbNameResolver from './common/middleware/dbNameResolver.js'
import { authenticateToken } from './common/middleware/authMiddleware.js'
import { authorizeRoles } from './common/middleware/authorizeRoles.js'

// routes
import { initUserModule as userModuleV1 } from './modules/user/v1/user.module.js'

/**
 * Створює та налаштовує Express додаток
 */
export async function createExpressApp({ staticFilesDir = 'public' } = {}) {
    // Створюємо екземпляр додатку
    const app = express()

    // <=======================================================================>
    // <=====================  Middleware Setup ===============================>
    // <=======================================================================>

    // --- 1. Ранні middleware для безпеки та продуктивності ---
    // Ці middleware мають працювати якомога раніше, щоб забезпечити базовий захист
    // та обробку мережевих запитів.

    // --- НАЛАШТУВАННЯ ДОВІРИ ДО ПРОКСІ ---
    // Це КРИТИЧНО. Вкажіть IP вашого фронтенд-сервера (або проксі).
    // 'loopback' довіряє 127.0.0.1. Можна вказати список IP: ['127.0.0.1', '192.168.1.100']
    app.set('trust proxy', ['loopback'])

    // Middleware для перенаправлення HTTP на HTTPS
    // Цей middleware повинен бути одним з перших, якщо використовується HTTPS,
    // щоб переконатися, що всі запити обробляються захищеним протоколом.
    app.use(forceHttps(config.server.useHttps))

    // Додає різні HTTP-заголовки для підвищення безпеки.
    // Працює на рівні заголовків, тому повинен бути дуже раннім.
    // Застосовуйте Helmet до всього, КРІМ шляхів Swagger UI
    app.use((req, res, next) => {
        const url = req.originalUrl

        // Регулярний вираз: шукає /api-docs у будь-якому місці шляху
        // Наприклад: /api-docs, /api/v1/api-docs, /api/v2/api-docs
        const isSwagger = /\/api-docs/.test(url)

        // Список префіксів, для яких ми не застосовуємо стандартний Helmet
        const otherExclusions = ['/api-docs', '/public', '/webhooks']

        const isExcluded = otherExclusions.some((prefix) => url.startsWith(prefix))

        if (isSwagger) {
            return next()
        }

        if (isExcluded) {
            return next()
        }

        // В іншому випадку для всього іншого, застосувати Helmet
        helmet({ hsts: config.server.useHttps })(req, res, next)
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
    app.use(dbNameResolver)

    // Отримує інформацію про користувача з токенів без сторонніх бібліотек (декодування JWT).
    // Він повинен працювати після парсерів (оскільки може читати з body або cookies)
    // і перед Morgan, щоб Morgan міг використовувати `req.logUserContext`.
    app.use(userResolver)

    // Middleware для логування HTTP-запитів.
    // Morgan повинен бути після `userResolver`, щоб мати доступ до `req.logUserContext`.
    // Його також бажано поставити перед Rate Limiter, щоб логувати спроби, які будуть відхилені лімітером.
    app.use(morganMiddleware)

    // --- 4. Обмеження частоти запитів (Rate Limiting) ---
    // Цей middleware обмежує кількість запитів і має бути перед вашими основними маршрутами,
    // але після логування, щоб відхилені запити теж були залогівані.

    // Обмеження на 100 запитів з одного IP протягом 15 хвилин.
    // Застосовується до всіх API-маршрутів. Розмістіть його після логування,
    // але до вашої основної логіки маршрутів.
    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 хвилин
        limit: 100, // Ліміт запитів
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        // Пропускаємо Swagger
        skip: (req) => {
            const url = req.originalUrl

            // Регулярний вираз: шукає /api-docs у будь-якому місці шляху
            // Наприклад: /api-docs, /api/v1/api-docs, /api/v2/api-docs
            const isSwagger = /\/api-docs/.test(url)

            return isSwagger
        },
        // Генерація ключа (User ID або IP)
        keyGenerator: (req) => {
            // 1. Якщо користувач авторизований — обмежуєм по ID (самий правильний спосіб)
            if (req.user?.id) return `user:${req.user.id}`

            // 2. Якщо запит йду через твій проксі-бекенд,
            // Express (завдяки trust proxy) автоматично дістане реальний IP
            // з X-Forwarded-For і покалде в req.ip.
            return `ip:${req.ip}`
        },

        handler: (req, res) => {
            logger?.warn?.(`Rate limit exceeded for: ${req.ip}`)
            res.status(429).json({
                status: 429,
                message: 'Too many requests, please try again later.',
                retryAfter: res.getHeader('Retry-After'),
            })
        },
    })
    app.use('/api/', apiLimiter)

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
    async function addStaticFiles(staticFilesDir = 'public') {
        // Шлях до папки зі статичними файлами
        const staticFolderPath = path.resolve(process.cwd(), staticFilesDir)

        if (fs.existsSync(staticFolderPath)) {
            // Якщо папка існує, налаштовуємо роздачу статичних файлів
            app.use(express.static(staticFolderPath))
            logger?.info?.(`Serving static files from: ${staticFolderPath}`)
        } else {
            logger?.warn?.(
                `Static folder "${staticFolderPath}" not found or inaccessible. Static files will not be served from this path.`,
            )
        }
    }
    await addStaticFiles(staticFilesDir)

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

    const dbManagerInstance = OracleDatabaseManager.getInstance()
    // -----------------     router - V1    ------------------------------------
    app.use(
        '/api/v1/users',
        userModuleV1({
            dbManager: dbManagerInstance,
            logger: logger,
            authMiddleware: {
                authenticate: authenticateToken,
            },
            rolesMiddleware: authorizeRoles,
        }).router,
    )

    // <=======================================================================>
    // <================   404 - Not Found Handler  ===========================>
    // <=======================================================================>

    // Цей middleware спрацює, якщо жоден з попередніх маршрутів або middleware
    // не обробив запит.
    app.use((req, res, next) => {
        logger?.warn?.(`404 Not Found: ${req.method} ${req.originalUrl}`)
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

    return app
}

// // 1. Role Module (не залежить ні від чого)
// const roleModule = RoleModule.init(connection);

// // 2. User Module (залежить від RoleService)
// const userModule = UserModule.init(connection, roleModule.service);

// // 3. Auth Module (залежить від UserService)
// const authModule = AuthModule.init(userModule.service);

// // Реєстрація маршрутів
// app.use('/api/auth', authModule.router);
// app.use('/api/roles', authModule.middleware.verifyToken, roleModule.router);
// app.use('/api/users', authModule.middleware.verifyToken.bind(authModule.middleware), userModule.router);
