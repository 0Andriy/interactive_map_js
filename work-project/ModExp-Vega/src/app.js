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
import { responseEnhancer } from './common/middleware/response.middleware.js'
import errorHandling from './common/middleware/globalErrorHandler.js'
import forceHttps from './common/middleware/forceHttps.js'
import { userResolver } from './common/middleware/userResolver.js'
import { requestContextMiddleware } from './common/middleware/requestContext.js'
import morganMiddleware from './common/middleware/morganMiddleware.js'
import dbNameResolver from './common/middleware/dbNameResolver.js'
// import { authenticateToken } from './common/middleware/authMiddleware.js'
// import { authorizeRoles } from './common/middleware/authorizeRoles.js'

// routes api - modules
import { UserModule as UserModuleV1 } from './modules/users/v1/user.module.js'
import { SessionModule as SessionModuleV1 } from './modules/sessions/v1/session.module.js'
import { AuthModule as AuthModuleV1 } from './modules/auth/v1/auth.module.js'
// import { RoleModule as RoleModuleV1 } from './modules/role/v1/role.module.js'
import { IosModule as IosModuleV1 } from './modules/ios-external/v1/ios.module.js'

// routes web
import webRoutesFactory from './web/index.js'

//
import { fileURLToPath } from 'url'
// Отримуємо повний шлях до поточного ФАЙЛУ
const __filename = fileURLToPath(import.meta.url)
// Отримуємо шлях до поточної ПАПКИ
const __dirname = path.dirname(__filename)

/**
 * Створює та налаштовує Express додаток
 */
export async function createExpressApp({ staticFilesDir = 'public', wss = null, ...rest } = {}) {
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

    const getCspConfig = () => {
        if (!config.server.useHttps) return false

        return {
            // Вмикає стандартні директиви helmet
            useDefaults: true,
            // Перевизначаємо
            directives: {
                'img-src': ["'self'", 'data:', 'blob:'],
                'frame-ancestors': ['*'], // Дозволяємо iframe всюди
            },
        }
    }

    const helmetMiddleware = helmet({
        hsts: config.server.useHttps,
        contentSecurityPolicy: getCspConfig(),
        // Якщо HTTPS — вимикаємо X-Frame-Options (бо frame-ancestors: '*' його замінює)
        xFrameOptions: config.server.useHttps ? false : { action: 'sameorigin' },
    })

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

        helmetMiddleware(req, res, next)
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
    app.use(express.json({ limit: '1mb' }))

    // Для парсингу URL-кодованих тіл запитів.
    app.use(express.urlencoded({ extended: true }))

    // Для парсингу Cookie.
    // Потрібно, якщо зчитуєте токени або інші дані з cookie.
    app.use(cookieParser())

    // Підключення RESPONSE HANDLER для можливості стандартизації відповіді
    // Ми робимо це до роутів, щоб у кожного `res` з'явилися методи .success() та .error()
    app.use(responseEnhancer)

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
    // Масив правил для пропуску (Whitelist)

    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 хвилин
        limit: (req) => {
            const url = req.originalUrl

            // Перевіряємо, чи містить URL шлях /portal/
            // i - ігнорувати регістр, якщо раптом шлях буде /Portal/
            const isPortalRequest = /\/portal\//i.test(url)

            // Також додаємо перевірку на інші ознаки важких запитів (наприклад, POST)
            const isHeavyRequest = isPortalRequest || req.method === 'POST'

            // Якщо це портал або POST — даємо 2000, інакше стандартні 500
            return isHeavyRequest ? 2000 : 500
        },
        standardHeaders: 'draft-7',
        legacyHeaders: false,

        // ВИНЯТКИ (Skip)
        // Повністю пропускати перевірку для певних умов
        skip: (req) => {
            const skipRules = [
                (req) => {
                    // Swagger
                    // Регулярний вираз: шукає /api-docs у будь-якому місці шляху
                    // Наприклад: /api-docs, /api/v1/api-docs, /api/v2/api-docs
                    return /\/api-docs/.test(req.originalUrl)
                },
                (req) => /\/health/.test(req.originalUrl), // Перевірка стану сервера
                (req) => req.ip === '127.0.0.1', // Локальні запити
                // Додайте будь-яке нове правило тут:
                // (req) => req.headers['x-internal-service'],
            ]

            return skipRules.some((rule) => rule(req))
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
            logger?.warn?.(`Rate limit exceeded for: ${req.ip} on ${req.originalUrl}`)
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
    async function addStaticFiles(data = 'public') {
        let configs = []

        // 1. Приводимо будь-який ввід до єдиного формату масиву об'єктів [{ route, dir }]
        if (typeof data === 'string') {
            configs.push({ route: '/', dir: data })
        } else if (Array.isArray(data)) {
            configs = data.map((dir) => ({ route: '/', dir }))
        } else if (typeof data === 'object') {
            configs = Object.entries(data).map(([route, dir]) => ({ route, dir }))
        }

        // 2. Реєструємо кожен шлях
        for (const { route, dir } of configs) {
            // Шлях до папки зі статичними файлами
            const staticFolderPath = path.resolve(process.cwd(), dir)

            if (fs.existsSync(staticFolderPath)) {
                // Використовуємо route для префіксу (наприклад '/' або '/api-assets')
                app.use(route, express.static(staticFolderPath))
                logger?.info?.(`Static files served: "${dir}" at mount point "${route}"`)
            } else {
                logger?.warn?.(`Static folder not found: "${staticFolderPath}"`)
            }
        }
    }
    await addStaticFiles(staticFilesDir)

    // Движок для web сторінок
    app.set('views', path.join(__dirname, 'web', 'views'))
    app.set('view engine', 'ejs')

    // <=======================================================================>
    // <====================== Routes API (endpoints) =========================>
    // <=======================================================================>

    // // Усі API маршрути матимуть префікс /api
    // app.use('/api', apiRoutes)

    // 0. Залежності
    const dbManager = rest.dbManager
    const jwtManager = rest.jwtManager

    // 1. Ініціалізуємо модуль користувачів
    const userModuleV1 = new UserModuleV1({ dbManager })
    const userExportsV1 = userModuleV1.exports()
    // app.use('/api/v1/users', userExportsV1.router)

    // 2. Ініціалізуємо модуль сесій
    const sessionModuleV1 = new SessionModuleV1({ dbManager })
    const sessionExportsV1 = sessionModuleV1.exports()
    // app.use('/api/v1/users', sessionExportsV1.router)

    // 3. Ініціалізуємо головний модуль авторизації, передаючи йому репозиторії з ДВОХ різних модулів та менеджери
    const authModuleV1 = new AuthModuleV1({
        dbManager,
        jwtManager,
        sessionRepository: sessionExportsV1.repository, // З SessionModule
        userRepository: userExportsV1.repository, // З UserModule
        logger: logger,
    })
    const authModuleExportsV1 = authModuleV1.exports()

    // Глобальний middleware (пропуск по IP)
    const allowedIpsArray = process.env.NAEK_IP ? process.env.NAEK_IP.split(',') : []
    app.use(
        authModuleExportsV1.guard.bypassByIp(allowedIpsArray, {
            login: 'NAEK',
            name: 'NAEK',
        }),
    )

    app.use('/api/v1/auth', authModuleExportsV1.router)

    // 4. Модуль для IOS (Vega, wDispo)
    const iosModuleV1 = new IosModuleV1({
        authGuard: authModuleExportsV1.guard,
        wss: wss,
        logger: logger,
    })
    const iosModuleExportsV1 = iosModuleV1.exports()
    app.use('/api/v1/ios', iosModuleExportsV1.router)

    // <=======================================================================>
    // <====================== STATIC (endpoints) =========================>
    // <=======================================================================>

    /**
     * @swagger
     * /GetMenu:
     *   get:
     *     summary: отримання дерева меню для НАЕК
     *     description: Повертає дерево в JSON
     *     tags: [IOS]
     *     security:
     *       - BearerAuth: []
     *     responses:
     *       200:
     *         description: Успішний запит. Дерево меню НАЕК
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     */
    app.get('/GetMenu', (req, res) => {
        const result = {
            menu: {
                name: 'ХАЕС',
                childrens: [
                    {
                        name: 'Блок 1',
                        childrens: [],
                        schemes: [
                            {
                                title: 'Перший контур',
                                path: 'fragments?unit=1&mode=auto&fragment=H00R',
                            },
                            {
                                title: 'Другий контур',
                                path: 'fragments?unit=1&mode=auto&fragment=H00N',
                            },
                            {
                                title: 'Власні потреби',
                                path: 'fragments?unit=1&mode=auto&fragment=GVP',
                            },

                            {
                                title: 'Споживачі надійного електропостачання',
                                path: 'fragments?unit=1&mode=auto&fragment=СНЕ',
                            },
                            {
                                title: 'ПАМС',
                                path: 'fragments?unit=1&mode=auto&fragment=ПАМС',
                            },
                        ],
                    },
                    {
                        name: 'Блок 2',
                        childrens: [],
                        schemes: [
                            {
                                title: 'Перший контур',
                                path: 'fragments?unit=2&mode=auto&fragment=H00R',
                            },
                            {
                                title: 'Другий контур',
                                path: 'fragments?unit=2&mode=auto&fragment=H00N',
                            },
                            {
                                title: 'Власні потреби',
                                path: 'fragments?unit=2&mode=auto&fragment=GVP',
                            },

                            {
                                title: 'Споживачі надійного електропостачання',
                                path: 'fragments?unit=2&mode=auto&fragment=СНЕ',
                            },
                            {
                                title: 'ПАМС',
                                path: 'fragments?unit=2&mode=auto&fragment=ПАМС',
                            },
                        ],
                    },
                ],
                schemes: [
                    {
                        title: 'Відкрита розподільча установка',
                        path: 'fragments?unit=1&mode=auto&fragment=VRU',
                    },
                ],
            },
        }

        res.status(200).json(result)
    })

    // <=======================================================================>
    // <====================== Routes WEB (endpoints) =========================>
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

    // Веб-сторінки
    // Передаємо залежності через DI-фабрику
    const webRoutes = webRoutesFactory({
        authModule: authModuleExportsV1,
        iosModule: iosModuleExportsV1,
    })
    // Підключаємо отримані роути в додаток
    app.use('/', webRoutes)

    // <=======================================================================>
    // <==============  SPA Fallback (ВАЖЛИВО для Frontend)  ==================>
    // <=======================================================================>
    // Якщо це не API запит, але файл не знайдено — віддаємо index.html
    // Це дозволяє Frontend-роутингу працювати після оновлення сторінки
    app.get(/.*/, (req, res, next) => {
        // Якщо шлях починається з /api, ігноруємо SPA фалбек
        if (req.path.startsWith('/api')) {
            return next()
        }

        // 3. Ігноруємо запити до статичних файлів (js, css, png тощо),
        // щоб сторінка логіну могла нормально завантажити свої скрипти та стилі
        if (req.path.includes('.')) {
            return next()
        }

        // Якщо це будь-який інший маршрут (наприклад, /dashboard, /profile) — редиректимо
        res.redirect('/login')
    })

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
