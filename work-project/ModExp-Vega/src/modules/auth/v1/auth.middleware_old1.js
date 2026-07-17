import { CustomError } from '../../../common/utils/CustomError.js'
import config from '../../../config/config.js'

export class AuthGuard {
    /**
     * @param {Object} tokenService - Сервіс для генерації, верифікації та хешування токенів
     * @param {Object} sessionRepository - Репозиторій для керування сесіями в БД Oracle
     * @param {Object} userRepository - Репозиторій для роботи з користувачами
     * @param {Object} authService - Головний бізнес-сервіс модуля авторизації
     */
    constructor(tokenService, sessionRepository, userRepository, authService) {
        this.tokenService = tokenService
        this.sessionRepository = sessionRepository
        this.userRepository = userRepository
        this.authService = authService
        this.logger = null

        // Запобігаємо втраті контексту "this" у движку Express
        // Жорстка прив'язка контексту методів для безпечної роботи у конвеєрі Express
        this.authenticateApi = this.authenticateApi.bind(this)
        this.authenticatePages = this.authenticatePages.bind(this)
        this.stopAuthenticatedGuests = this.stopAuthenticatedGuests.bind(this)
        this._clearSessionAndRedirect = this._clearSessionAndRedirect.bind(this)
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
        if (req.cookies) {
            const { name: accessCookieName } = config.tokenTypes.access.transport.cookie
            const { name: refreshCookieName } = config.tokenTypes.refresh.transport.cookie

            accessToken = req.cookies?.[accessCookieName] || null
            refreshToken = req.cookies?.[refreshCookieName] || null
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
        const accessCookieName = config.tokenTypes.access.transport.cookie.name
        const refreshCookieName = config.tokenTypes.refresh.transport.cookie.name

        res.clearCookie(accessCookieName)
        res.clearCookie(refreshCookieName)

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

                const metadata = {
                    ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    deviceFingerprint: req.headers['x-device-fingerprint'] || null,
                }

                // Виклик бізнес-логіки ротації сесії в базі Oracle та генерація нових токенів
                const sessionTokens = await this.authService.refreshTokens(refreshToken, metadata)

                // Оновлюємо куки у браузері клієнта
                const refreshOptions = { ...refreshCookieConfig.options }
                if (sessionTokens.rememberMe) {
                    refreshOptions.maxAge = refreshCookieConfig.options.maxAge
                }

                res.cookie(
                    accessCookieConfig.name,
                    sessionTokens.accessToken,
                    accessCookieConfig.options,
                )
                res.cookie(refreshCookieConfig.name, sessionTokens.refreshToken, refreshOptions)

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
     * MIDDLEWARE ДЛЯ АПІ (REST API): Повертає структурований JSON з помилкою у разі невдачі
     */
    async authenticateApi(req, res, next) {
        try {
            const sessionPayload = await this._validateSessionOrRefresh(req, res)

            if (!sessionPayload) {
                throw CustomError.Unauthorized(
                    'Доступ заборонено. Сесія застаріла або токен відсутній.',
                    {
                        sysCode: 'ACCESS_TOKEN_MISSING',
                    },
                )
            }

            const userLogin = sessionPayload.userLogin || sessionPayload.sub

            // Перевірка актуального стану користувача в СУБД Oracle
            const dbUser = await this.userRepository.findUserByLogin(userLogin)
            if (!dbUser) {
                throw CustomError.NotFound('Ваш обліковий запис не знайдено в системі.', {
                    sysCode: 'ACCOUNT_NOT_FOUND',
                })
            }

            // if (dbUser.IS_ACTIVE === 0 || dbUser.isActive === false) {
            //     throw CustomError.Forbidden('Ваш обліковий запис заблоковано адміністратором.', {
            //         sysCode: 'ACCOUNT_BANNED',
            //     })
            // }

            // Наповнюємо об'єкт запиту актуальними даними з БД та токена
            req.user = {
                userId: dbUser.ID ?? sessionPayload.userId,
                userLogin: dbUser.USERNAME ?? userLogin,
                tab_no: dbUser.TAB_NO ?? sessionPayload.tab_no,
                name: sessionPayload.name,
                roles: dbUser.USER_ROLES ?? sessionPayload.roles,
                firstName: dbUser.IMYA ?? sessionPayload.firstName,
                lastName: dbUser.FAMILIA ?? sessionPayload.lastName,
                middleName: dbUser.OTCHESTVO ?? sessionPayload.middleName,
                authType: sessionPayload.authType ?? 'DATABASE',
                rememberMe: sessionPayload.rememberMe ?? true,
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
                const userRole = req.user.role?.toUpperCase()
                const hasAccess = allowedRoles.map((role) => role.toUpperCase()).includes(userRole)

                if (!hasAccess) {
                    throw CustomError.Forbidden(
                        'Недостатньо прав для виконання цієї операції або перегляду ресурсу.',
                        {
                            sysCode: 'INSUFFICIENT_PERMISSIONS',
                            requiredRoles: allowedRoles,
                            userRole: req.user.role,
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
                const userLogin = queryPayload.userLogin || queryPayload.sub

                // КЕЙС 1: Користувач ВЖЕ авторизований у куках під ТИМ САМИМ логіном
                if (sessionPayload && sessionPayload.userLogin === userLogin) {
                    this.logger?.debug?.(
                        `ℹ️ Користувач ${userLogin} вже авторизований. Очищаємо URL.`,
                    )

                    req.user = sessionPayload

                    return this._redirectWithCleanUrl(req, res, tokenKeys)
                }

                // КЕЙС 2: Користувач не авторизований, АБО авторизований під ІНШИМ логіном (перезапис сесії)
                const dbUser = await this.userRepository.findUserByLogin(userLogin)

                if (!dbUser /*|| dbUser.IS_ACTIVE === 0*/) {
                    this.logger?.warn?.(`🚨 Спроба входу в неіснуючий акаунт: ${userLogin}`)
                    return this._clearSessionAndRedirect(req, res, 'USER_NOT_FOUND')
                }

                const metadata = {
                    ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
                    userAgent: req.headers['user-agent'] || 'Unknown',
                    deviceFingerprint: req.headers['x-device-fingerprint'] || null,
                }

                const sessionResult = await this.authService._createSession(
                    dbUser,
                    {
                        authType: queryPayload.authType || 'DATABASE',
                        rememberMe: queryPayload.rememberMe ?? false,
                        appId: this.currentApp || 'VEGA_USER' || queryPayload.aud || null,
                    },
                    metadata,
                )

                const {
                    accessToken: newAccessToken,
                    refreshToken: newRefreshToken,
                    user,
                } = sessionResult

                // Встановлення нових безпечних кук
                const accessCookieConfig = config.tokenTypes.access.transport.cookie
                const refreshCookieConfig = config.tokenTypes.refresh.transport.cookie

                res.cookie(accessCookieConfig.name, newAccessToken, accessCookieConfig.options)
                res.cookie(refreshCookieConfig.name, newRefreshToken, refreshCookieConfig.options)

                req.user = user //tokenPayload

                return this._redirectWithCleanUrl(req, res, tokenKeys)

                // // Очищаємо токен з URL рядка та виконуємо безпечний HTTP-редирект на чисту сторінку
                // // Обов'язквово видаляємо де може бути токен авторизації ато буде помилка ERR_TOO_MANY_REDIRECTS (зациклювання)
                // const queryParams = { ...req.query }
                // delete queryParams.token
                // delete queryParams.t

                // tokenKeys.forEach((key) => delete queryParams[key]) // Видаляє і 'token', і 't'

                // // Формуємо чистий URL (зберігаючи інші query параметри, якщо вони були)
                // const queryString = new URLSearchParams(queryParams).toString()
                // const cleanUrl = req.path + (queryString ? `?${queryString}` : '')

                // this.logger?.debug?.(
                //     `✨ [AuthGuard] Наскрізний вхід успішний. Редірект на чистий URL: ${cleanUrl}`,
                // )

                // return res.redirect(cleanUrl)
            }

            // // Стандартна перевірка кук та автоматичний Silent Refresh через спільний хелпер
            // const sessionPayload = await this._validateSessionOrRefresh(req, res)

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
            const accessCookieConfig = config.tokenTypes.access.transport.cookie
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
            res.clearCookie(accessCookieConfig.name)
            res.clearCookie(refreshCookieConfig.name)

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
            const sessionPayload = await this.tokenService
                .verifyAccessToken(accessToken)
                .catch((err) => {
                    this.logger?.debug?.(
                        `⚠️ [AuthGuard WS] Токен не пройшов криптографічну перевірку: ${err.message}`,
                    )
                    return null
                })
            if (!sessionPayload) return null

            // 3. Перевірка стану користувача в СУБД Oracle
            const dbUser = await this.userRepository.findUserByLogin(sessionPayload.userLogin)
            if (!dbUser) {
                this.logger?.debug?.(
                    `⚠️ [AuthGuard WS] Користувача ${sessionPayload.userLogin} не знайдено в Oracle.`,
                )
                return null
            }

            // if (dbUser.IS_ACTIVE === 0 || dbUser.isActive === false) {
            //     this.logger?.debug?.(
            //         `⚠️ [AuthGuard WS] Обліковий запис ${sessionPayload.userLogin} заблоковано.`,
            //     )
            //     return null
            // }

            // Повертаємо чистий об'єкт користувача для сокет-сесії
            return {
                id: dbUser.ID || sessionPayload.userId,
                userLogin: dbUser.USERNAME || sessionPayload.userLogin,
                role: dbUser.USER_ROLE || sessionPayload.role,
                authType: sessionPayload.authType || 'DATABASE',
            }
        } catch (error) {
            this.logger?.error?.('❌ [AuthGuard WS] Збій автентифікації WebSocket:', error.message)
            return null
        }
    }
}
