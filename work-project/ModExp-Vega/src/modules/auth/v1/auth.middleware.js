import { CustomError } from '../../../common/utils/CustomError.js'
import config from '../../../config/config.js'

export class AuthGuard {
    /**
     * @param {Object} tokenService - Сервіс для генерації, верифікації та хешування токенів
     * @param {Object} sessionRepository - Репозиторій для керування сесіями в БД Oracle
     * @param {Object} userRepository - Репозиторій для роботи з користувачами
     * @param {Object} authService - Головний бізнес-сервіс модуля авторизації
     * @param {Object} authController
     */
    constructor(
        tokenService,
        sessionRepository,
        userRepository,
        authService,
        authController,
        logger = null,
    ) {
        this.tokenService = tokenService
        this.sessionRepository = sessionRepository
        this.userRepository = userRepository
        this.authService = authService
        this.authController = authController
        this.logger = logger
        this.currentApp = 'VEGA_USER' // null

        // Запобігаємо втраті контексту "this" у движку Express
        // Жорстка прив'язка контексту методів для безпечної роботи у конвеєрі Express
        this.bypassByIp = this.bypassByIp.bind(this)
        this.authenticateApi = this.authenticateApi.bind(this)
        this.authenticatePages = this.authenticatePages.bind(this)
        this.stopAuthenticatedGuests = this.stopAuthenticatedGuests.bind(this)
        this.clearSessionOnLoginOpen = this.clearSessionOnLoginOpen.bind(this)
        this.authenticateWebSocket = this.authenticateWebSocket.bind(this)
    }

    /**
     * ПРИВАТНИЙ ХЕЛПЕР: Універсальне вилучення токенів з усіх можливих джерел.
     * Шукає токени всюди: у куках, у заголовках та у тілі (body) запиту.
     * @private
     * @param {Object} req - Об'єкт запиту Express
     * @returns {Object} { accessToken: string|null, refreshToken: string|null }
     */
    _extractTokensFromRequest(req, res, next) {
        let accessToken = null
        let refreshToken = null

        // 1. ДЖЕРЕЛО №1: Cookies (Найвищий пріоритет для Web-браузерів)
        // Підтримуємо розпарсені Express куки АБО парсимо сирий заголовок для WebSocket хендшейку
        let cookies = req.cookies

        if (!cookies && req.headers?.cookie) {
            try {
                cookies = Object.fromEntries(
                    req.headers.cookie.split('; ').map((pair) => {
                        const [key, ...val] = pair.split('=')
                        return [key.trim(), decodeURIComponent(val.join('='))]
                    }),
                )
            } catch (err) {
                cookies = null
            }
        }

        if (cookies) {
            const { name: accessCookieName } = config.tokenTypes.access.transport.cookie
            const { name: refreshCookieName } = config.tokenTypes.refresh.transport.cookie

            accessToken = cookies?.[accessCookieName] || null
            refreshToken = cookies?.[refreshCookieName] || null
        }

        // 2. ДЖЕРЕЛО №2: HTTP Headers (Для Mobile, Desktop та Postman)
        // Якщо в куках не знайшли access токен — шукаємо в Authorization Bearer
        if (!accessToken && req.headers.authorization) {
            const authHeader = req.headers.authorization
            const [scheme, token] = authHeader.split(' ')

            if (scheme === 'Bearer' && token) {
                accessToken = token
            }
        }

        // Якщо в куках не знайшли refresh токен — шукаємо в кастомному заголовку
        if (!refreshToken && req.headers['x-refresh-token']) {
            refreshToken = req.headers['x-refresh-token'] || null
        }

        // 3. ДЖЕРЕЛО №3: Request Body (Гібридний варіант для Mobile/API клієнтів)
        // Якщо токени досі не знайдені, заглядаємо в JSON body запиту
        if (!accessToken && req.body?.accessToken) {
            accessToken = req.body.accessToken
        }
        if (!refreshToken && req.body?.refreshToken) {
            refreshToken = req.body.refreshToken
        }

        // 4. ДЖЕРЕЛО №4: Request Query (Для WebSockets Handshake та наскрізних посилань)
        // Підтримуємо як стандартний Express req.query, так і сирий нативний URL (для сокет-апгрейдів)
        let queryParams = req.query

        if (!queryParams && req.url && req.url.includes('?')) {
            try {
                // Якщо Express ще не розпарсив URL (наприклад, на етапі сирого upgrade в сокетах), парсимо вручну
                const rawUrl = new URL(req.url, `http://${req.headers?.host || 'localhost'}`)
                queryParams = Object.fromEntries(rawUrl.searchParams.entries())
            } catch (err) {
                queryParams = {}
            }
        }

        if (!accessToken && queryParams?.token) {
            accessToken = queryParams.token
        }
        if (!accessToken && queryParams?.accessToken) {
            accessToken = queryParams.accessToken
        }
        if (!refreshToken && queryParams?.refreshToken) {
            refreshToken = queryParams.refreshToken
        }

        // 5. ДЖЕРЕЛО №5: Sec-WebSocket-Protocol (Кастомне джерело для сокетів)
        // Якщо токен передається першим елементом у масиві субпротоколів
        if (!accessToken && req.headers?.['sec-websocket-protocol']) {
            try {
                const protocolHeader = req.headers['sec-websocket-protocol']
                const protocols = protocolHeader.split(',').map((p) => p.trim())

                // Беремо перший протокол як токен
                if (protocols[0]) {
                    accessToken = protocols[0]
                }
            } catch (err) {
                // ігноруємо помилки обробки заголовка протоколу
            }
        }

        return {
            accessToken,
            refreshToken,
        }
    }

    /**
     * ПРИВАТНИЙ ХЕЛПЕР: Очищення залишків кук у браузері та перенаправлення на вхід із повідомленням
     * @private
     */
    _clearSessionAndRedirect(req, res, error = null) {
        //
        this.authController.clearAuthCookies(res)

        // 2. Якщо помилки немає, робимо звичайний чистий редірект
        if (!error) {
            return res.redirect('/login')
        }

        // 3. Витягуємо всі можливі маркери помилки
        const message = typeof error === 'string' ? error : error.message || ''
        // Шукаємо причину скрізь, де її міг сховати CustomError (в коріні помилки, в context або в details)
        const reason = error?.reason || error?.context?.reason || error?.details?.reason || ''
        const status = error?.status || error?.statusCode || null

        // Базовий дефолтний текст
        let userFriendlyMessage = 'Не вдалося увійти за посиланням. Спробуйте знову.'

        // 4. ПЕРЕВІРКА МАРКЕРІВ (Шукаємо і за текстом, і за технічним reason, і за HTTP статусом)
        if (
            reason === 'APPLICATION_ACCESS_DENIED' ||
            message.includes('APPLICATION_ACCESS_DENIED') ||
            status === 403
        ) {
            userFriendlyMessage = 'У вас немає дозволу на використання цього додатка.'
        } else if (
            reason === 'TOKEN_EXPIRED' ||
            message.includes('jwt expired') ||
            message.includes('invalid token')
        ) {
            userFriendlyMessage = 'Посилання для входу застаріло або є недійсним.'
        } else if (reason === 'INVALID_CREDENTIALS' || message.includes('INVALID_CREDENTIALS')) {
            userFriendlyMessage = 'Невірний логін або пароль.'
        } else if (message) {
            // Якщо жоден маркер не збігся, але є якесь інше адекватне повідомлення — показуємо його
            userFriendlyMessage = message
        }

        // Безпечно кодуємо рядок для URL query
        const encodedMessage = encodeURIComponent(userFriendlyMessage)

        // 5. Перенаправляємо з query-параметром помилки
        return res.redirect(`/login?error=${encodedMessage}`)
    }

    // Допоміжний метод для очищення URL (щоб не дублювати код)
    _redirectWithCleanUrl(req, res, keysToRemove = ['token', 't']) {
        const queryParams = { ...req.query }

        // Гнучкий та 100% безпечний захист "на дурака":
        let keys = []
        if (Array.isArray(keysToRemove)) {
            keys = keysToRemove // Якщо це правильний масив, просто беремо його
        } else if (typeof keysToRemove === 'string') {
            keys = [keysToRemove] // Якщо передали один рядок (наприклад, 't'), загортаємо його в масив
        } else if (keysToRemove && typeof keysToRemove === 'object') {
            keys = Object.keys(keysToRemove) // Якщо передали об'єкт, візьмемо його ключі
        }

        // Видаляємо тільки якщо це рядки
        keys.forEach((key) => {
            if (typeof key === 'string') {
                delete queryParams[key]
            }
        })

        const queryString = new URLSearchParams(queryParams).toString()
        const cleanUrl = req.path + (queryString ? `?${queryString}` : '')

        this.logger?.debug?.(
            `✨ [AuthGuard] Наскрізний вхід успішний. Редірект на чистий URL: ${cleanUrl}`,
        )

        return res.redirect(cleanUrl)
    }

    /**
     * ПРИВАТНИЙ ХЕЛПЕР: Єдине серце валідації токенів та запуску Silent Refresh
     * Запобігає дублюванню коду між усіма типами middleware
     * @private
     */
    async _validateSessionOrRefresh(req, res) {
        const { accessToken, refreshToken } = this._extractTokensFromRequest(req)
        const accessCookieConfig = config.tokenTypes.access.transport.cookie
        const refreshCookieConfig = config.tokenTypes.refresh.transport.cookie

        // Сценарій 1: Надано діючий Access токен
        if (accessToken) {
            try {
                const decodedAccessPayload = await this.tokenService.verifyAccessToken(accessToken)
                return decodedAccessPayload // Токен валідний, повертаємо дані сесії
            } catch (jwtError) {
                this.logger?.debug?.(
                    '⚠️ [AuthGuard] Access токен застарів або пошкоджений. Перевіряємо Refresh...',
                )
            }
        }

        // Сценарій 2: Access токен відсутній або згас, але є Refresh токен
        if (refreshToken) {
            try {
                // Криптографічна перевірка підпису JWT Refresh токена перед походом в БД
                await this.tokenService.verifyRefreshToken(refreshToken)

                const metadata = this.authController.extractMetadata(req)

                // Виклик бізнес-логіки ротації сесії в базі Oracle та генерація нових токенів
                const sessionTokens = await this.authService.refreshTokens(refreshToken, {
                    ...metadata,
                    app: this.currentApp,
                })

                // Оновлюємо куки у браузері клієнта
                this.authController.setAuthCookies(res, sessionTokens, sessionTokens.rememberMe)

                // Декодуємо свіжий токен для отримання актуальних даних користувача
                const updatedAccessPayload = await this.tokenService.verifyAccessToken(
                    sessionTokens.accessToken,
                )
                this.logger?.debug?.('🔄 [AuthGuard] Автоматичний Silent Refresh успішно виконано.')

                return updatedAccessPayload
            } catch (refreshError) {
                this.logger?.error?.(
                    '❌ [AuthGuard] Збій верифікації або ротації Refresh токена:',
                    refreshError.message,
                )
                return null // Сесію повністю скомпрометовано або вичерпано
            }
        }

        return null // Жодного токена не знайдено
    }

    /**
     * MIDDLEWARE ДЛЯ ФІЛЬТРАЦІЇ ПО IP
     * Приймає масив дозволених IP адрес та опціональну роль/дані для віртуального користувача
     */
    bypassByIp(allowedIps = [], virtualUserOptions = {}) {
        return (req, res, next) => {
            // Отримуємо IP (в наявності app.set('trust proxy', true))
            const clientIp = req.ip || req.socket.remoteAddress

            if (allowedIps.includes(clientIp)) {
                if (this.logger) {
                    this.logger.info(
                        `[AuthGuard] Дозволено безпарольний доступ для IP: ${clientIp}`,
                    )
                }

                // Маркуємо запит як успішно валідований по IP
                req.isIpBypassed = true

                // Створюємо заготовку системного користувача, щоб контролери не падали.
                req.virtualIpUser = {
                    ...virtualUserOptions,
                    userId: 'IP_BYPASS_USER',
                    login: virtualUserOptions.login || 'SYSTEM_IP_USER',
                    tab_no: 'SYSTEM',
                    name: virtualUserOptions.name || 'IP Trusted Client',
                    roles: virtualUserOptions.roles || ['IP_TRUSTED_CLIENT'],
                    firstName: 'System',
                    lastName: 'Client',
                    middleName: 'IP',
                    authType: 'IP_WHITE_LIST',
                    rememberMe: false,
                }
            }

            // Завжди викликаємо next(). Якщо IP не підійшов, прапорці не створяться,
            // і наступні мідлевари виконають стандартну перевірку сесій.
            return next()
        }
    }

    /**
     * MIDDLEWARE ДЛЯ АПІ (REST API): Повертає структурований JSON з помилкою у разі невдачі
     */
    async authenticateApi(req, res, next) {
        try {
            // --- СТАНДАРТНА ЛОГІКА СЕСІЙ ТА ORACLE ---
            const sessionPayload = await this._validateSessionOrRefresh(req, res)

            // КЕЙС: Користувач пройшов перевірку по IP
            if (!sessionPayload && req.isIpBypassed && req.virtualIpUser) {
                req.user = req.virtualIpUser
                return next()
            }

            if (!sessionPayload) {
                throw CustomError.Unauthorized(
                    'Доступ заборонено. Сесія застаріла або токен відсутній.',
                    {
                        sysCode: 'ACCESS_TOKEN_MISSING',
                    },
                )
            }

            const login = sessionPayload.login || sessionPayload.sub

            // Перевірка актуального стану користувача в СУБД Oracle
            const dbUser = await this.userRepository.findUserByLogin(login)
            if (!dbUser) {
                throw CustomError.NotFound('Ваш обліковий запис не знайдено в системі.', {
                    sysCode: 'ACCOUNT_NOT_FOUND',
                })
            }

            // if (dbUser.IS_ACTIVE === 0 || dbUser.isActive === false) {
            //     throw CustomError.Forbidden('Ваш обліковий запис заблоковано.', {
            //         sysCode: 'ACCOUNT_BANNED',
            //     })
            // }

            // Наповнюємо об'єкт запиту актуальними даними з БД та токена
            req.user = {
                userId: dbUser.ID || sessionPayload.userId,
                login: dbUser.USERNAME || login,
                tab_no: dbUser.TAB_NO || sessionPayload.tab_no,
                name: sessionPayload.name,
                roles: dbUser.USER_ROLES || sessionPayload.roles || [], // Гарантуємо масив
                firstName: dbUser.IMYA || sessionPayload.firstName,
                lastName: dbUser.FAMILIA || sessionPayload.lastName,
                middleName: dbUser.OTCHESTVO || sessionPayload.middleName,
                authType: sessionPayload.authType || 'DATABASE',
                rememberMe: sessionPayload.rememberMe ?? false,
            }

            return next()
        } catch (error) {
            return next(error)
        }
    }

    /**
     * MIDDLEWARE ДЛЯ ПЕРЕВІРКИ РОЛЕЙ (RBAC)
     * Обмежує доступ до ендпоінтів на основі ролей користувача.
     * Підтримує передачу ролей як через кому hasRoles('A', 'B'), так і масивом hasRoles(['A', 'B']).
     * @param {...(string|string[])} rolesInput - Список або масив дозволених ролей
     */
    hasRoles(...rolesInput) {
        // За допомогою .flat() трансформуємо будь-який вхід (масиви чи аргументи) у звичайний плоский масив
        // .map(r => String(r).toUpperCase()) робить перевірку нечутливою до регістру
        const allowedRoles = rolesInput.flat().map((role) => String(role).toUpperCase())

        // Повертаємо стандартний Express middleware
        return (req, res, next) => {
            try {
                // 1. Перевіряємо, чи користувач взагалі пройшов попередній гвард (authenticateApi або authenticatePages)
                if (!req.user) {
                    throw CustomError.Unauthorized(
                        'Доступ заборонено. Користувач не ідентифікований.',
                        {
                            sysCode: 'USER_NOT_IDENTIFIED',
                        },
                    )
                }

                // 2. Перевіряємо, чи роль користувача є в списку дозволених
                // Перетворюємо до верхнього регістру (якщо не регістро залежні) для запобігання помилок (наприклад, 'admin' vs 'ADMIN')
                const userRoles = Array.isArray(req.user.roles)
                    ? req.user.roles.map((r) => String(r).toUpperCase())
                    : [String(req.user.roles).toUpperCase()]

                // Перевіряємо, чи є хоча б одна роль користувача серед дозволених
                const hasAccess = userRoles.some((role) => allowedRoles.includes(role))

                if (!hasAccess) {
                    throw CustomError.Forbidden(
                        'Недостатньо прав для виконання цієї операції або перегляду ресурсу.',
                        {
                            sysCode: 'INSUFFICIENT_PERMISSIONS',
                            requiredRoles: allowedRoles,
                            userRoles: req.user.roles,
                        },
                    )
                }

                // 3. Якщо все ок — передаємо керування далі
                return next()
            } catch (error) {
                // ОБОВ'ЯЗКОВО передаємо помилку в next, щоб Express передав її в глобальний error.middleware
                return next(error)
            }
        }
    }

    /**
     * MIDDLEWARE ДЛЯ СТОРІНОК (SSR + Сквозна авторизація): Перенаправляє на /login
     * protectWebRoute
     */
    async authenticatePages(req, res, next) {
        // 1. Визначаємо підтримувані ключі на початку або в константах класу
        const tokenKeys = ['token', 't']

        try {
            // const tokenFromQuery = req.query?.token ?? req.query?.t
            const tokenFromQuery = tokenKeys.reduce((acc, key) => acc || req.query?.[key], null)

            // 1. Спочатку перевіряємо наявність поточної активної сесії
            // Стандартна перевірка кук та автоматичний Silent Refresh через спільний хелпер
            const sessionPayload = await this._validateSessionOrRefresh(req, res).catch(() => null)

            // =========================================================================
            // КЕЙС НАСКРІЗНОГО ВХОДУ (Токен в URL)
            // =========================================================================
            if (tokenFromQuery) {
                const queryPayload = await this.tokenService.verifyAccessToken(tokenFromQuery)
                const login = queryPayload.login || queryPayload.sub

                // КЕЙС 1: Користувач ВЖЕ авторизований у куках під ТИМ САМИМ логіном
                if (sessionPayload && sessionPayload.login === login) {
                    this.logger?.debug?.(`ℹ️ Користувач ${login} вже авторизований. Очищаємо URL.`)

                    req.user = sessionPayload

                    return this._redirectWithCleanUrl(req, res, tokenKeys)
                }

                const metadata = this.authController.extractMetadata(req)
                const targetApp = this.currentApp || queryPayload.aud || 'VEGA_USER'

                const sessionResult = await this.authService.loginViaSsoToken(
                    {
                        login,
                        tokenPayload: queryPayload,
                        appId: targetApp,
                    },
                    metadata,
                )

                // Вставляємо куки
                this.authController.setAuthCookies(res, sessionResult, queryPayload.rememberMe)

                req.user = sessionResult.user

                return this._redirectWithCleanUrl(req, res, tokenKeys)
            }

            // КЕЙС: Користувач пройшов перевірку по IP
            if (!sessionPayload && req.isIpBypassed && req.virtualIpUser) {
                req.user = req.virtualIpUser
                return next()
            }

            // =========================================================================
            // КЕЙС ЗВИЧАЙНОГО ВХОДУ (Без токена в URL)
            // =========================================================================
            if (!sessionPayload) {
                // Звичайний редірект без помилки (користувач просто зайшов на закриту сторінку без сесії)
                return this._clearSessionAndRedirect(req, res)
            }

            req.user = sessionPayload

            return next()
        } catch (error) {
            this.logger?.error?.('❌ [AuthGuard Page] Помилка авторизації сторінки:', error.message)

            // Передаємо об'єкт помилки, хелпер сам витягне текст та згенерує гарний URL
            return this._clearSessionAndRedirect(req, res, error)
        }
    }

    /***
     * MIDDLEWARE ДЛЯ ГОСТЕЙ (Сторінка /login):
     * Захищає від повторного входу авторизованих осіб
     */
    async stopAuthenticatedGuests(req, res, next) {
        try {
            const sessionPayload = await this._validateSessionOrRefresh(req, res)

            // КЕЙС: Користувач пройшов перевірку по IP
            if (!sessionPayload && req.isIpBypassed && req.virtualIpUser) {
                return res.redirect('/')
            }

            // Якщо користувач має активні токени (або успішно оновився через Silent Refresh) — повертаємо його на головну
            if (sessionPayload) {
                this.logger?.debug?.(
                    '🚪 [AuthGuard] Користувач вже авторизований. Скасування доступу до /login, редірект на /',
                )
                return res.redirect('/')
            }

            // Якщо токенів немає і сесія чиста — пускаємо гостя заповнювати форму входу
            return next()
        } catch (error) {
            return next()
        }
    }

    /**
     * MIDDLEWARE ДЛЯ ПРИМУСОВОГО СКИДАННЯ СЕСІЇ ПРИ ВХОДІ
     * Повністю нищить поточну сесію в Oracle та браузері перед показом форми логіну.
     * Використовується, якщо кожен запуск сторінки /login має примусово розлогінювати користувача.
     */
    async clearSessionOnLoginOpen(req, res, next) {
        try {
            /*// КЕЙС: Користувач пройшов перевірку по IP
            if (req.isIpBypassed && req.virtualIpUser) {
                return res.redirect('/')
            }*/

            const refreshCookieConfig = config.tokenTypes.refresh.transport.cookie

            const refreshTokenFromCookie = req.cookies?.[refreshCookieConfig.name]

            // Якщо в куках браузера завалявся старий refresh-токен
            if (refreshTokenFromCookie) {
                this.logger?.debug?.(
                    '🧹 [AuthGuard] Виявлено активну сесію при відкритті /login. Видаляємо з Oracle...',
                )

                // Деактивуємо та видаляємо refresh токен з бази даних Oracle через бізнес-сервіс
                await this.authService.logout(refreshTokenFromCookie).catch((err) => {
                    this.logger?.error?.(
                        '⚠️ [AuthGuard] Не вдалося деактивувати сесію в Oracle при скиданні:',
                        err.message,
                    )
                })
            }

            // У будь-якому випадку примусово чистимо обидві куки в браузері користувача
            this.authController.clearAuthCookies(res)

            this.logger?.debug?.(
                '🟢 [AuthGuard] Стару сесію повністю зачищено. Користувач починає спочатку.',
            )
            return next()
        } catch (error) {
            // Якщо сталася непередбачувана помилка, все одно пускаємо користувача на логін
            return next()
        }
    }

    /**
     * МЕТОД ДЛЯ WEBSOCKETS (Безпечна валідація при підключенні)
     * Працює виключно у режимі читання (Read-Only) — без спроб редіректів чи запису кук.
     * @param {Object} req - HTTP запит рукостискання (upgrade request)
     * @returns {Promise<Object|null>} Payload користувача або null, якщо авторизація провалена
     */
    async authenticateWebSocket(req) {
        try {
            // 1. Витягуємо токени за допомогою спільного хелпера
            const { accessToken } = this._extractTokensFromRequest(req)

            // 2. Для сокетів валідуємо ТІЛЬКИ живий Access Token.
            // Якщо він відсутній — сокет не повинен робити Silent Refresh, це робота HTTP інфраструктури.
            if (!accessToken) {
                this.logger?.debug?.(
                    '⚠️ [AuthGuard WS] Відмовлено: Access токен відсутній у запиті сокета.',
                )
                return null
            }

            // 3. Верифікація підпису JWT Access токена
            const decodedPayload = await this.tokenService
                .verifyAccessToken(accessToken)
                .catch((err) => {
                    this.logger?.debug?.(
                        `⚠️ [AuthGuard WS] Токен не пройшов криптографічну перевірку: ${err.message}`,
                    )
                    return null
                })

            if (!decodedPayload) return null

            const login = decodedPayload.login || decodedPayload.sub

            // 3. Перевірка стану користувача в СУБД Oracle
            const dbUser = await this.userRepository.findUserByLogin(login)
            if (!dbUser) {
                this.logger?.debug?.(`⚠️ [AuthGuard WS] Користувача ${login} не знайдено в Oracle.`)
                return null
            }

            // if (dbUser.IS_ACTIVE === 0 || dbUser.isActive === false) {
            //     this.logger?.debug?.(
            //         `⚠️ [AuthGuard WS] Обліковий запис ${decodedPayload .login} заблоковано.`,
            //     )
            //     return null
            // }

            // Повертаємо чистий об'єкт користувача для сокет-сесії
            return {
                id: dbUser.ID || decodedPayload.userId,
                login: dbUser.USERNAME || login,
                roles: dbUser.USER_ROLES || decodedPayload.roles || [],
                authType: decodedPayload.authType || 'DATABASE',
            }
        } catch (error) {
            this.logger?.error?.('❌ [AuthGuard WS] Збій автентифікації WebSocket:', error.message)
            return null
        }
    }
}
