import { AuthSchema } from './auth.schema.js'
import config from '../../../config/config.js'
import { CustomError } from '../../../common/utils/CustomError.js'

export class AuthController {
    /**
     * @param {Object} authService - Головний бізнес-сервіс модуля auth
     */
    constructor(authService) {
        this.authService = authService
    }

    /**
     * Універсальний збір метаданих пристрою клієнта (Web, Mobile, Desktop)
     * @private
     */
    extractMetadata(req, validatedData = {}) {
        // 1. Безпечно дістаємо IP (якщо увімкнено app.set('trust proxy', true))
        let ip = req.ip

        // Резервний варіант, якщо trust proxy не увімкнено (беремо перший IP з ланцюжка)
        if (!ip && req.headers['x-forwarded-for']) {
            const forwardedIps = req.headers['x-forwarded-for'].split(',')
            ip = forwardedIps[0].trim() // Беремо перший легітимний IP з ланцюжка проксі
        }

        if (!ip) {
            ip = req.socket.remoteAddress || 'Unknown'
        }

        return {
            ipAddress: ip,
            userAgent: req.headers['user-agent'] || 'Unknown',

            // БЕЗПЕКА: Надаємо пріоритет заголовкам, але якщо їх немає — беремо вже валідовані дані з DTO
            // Очікуємо унікальний зліпок заліза від клієнта в кастомному заголовку або body
            deviceFingerprint:
                req.headers['x-device-fingerprint'] ||
                validatedData.deviceFingerprint ||
                req.body?.deviceFingerprint ||
                null,

            // Передаємо назву БД з контексту/запиту, щоб сервіс знав куди стукати при DATABASE авторизації
            dbName:
                req.headers['x-db-name'] ||
                validatedData.dbName ||
                req.body?.dbName ||
                req.context?.dbName ||
                null,
        }
    }

    /**
     * Допоміжний приватний метод для встановлення безпечних кук (Access та Refresh)
     * Використовується виключно для Web-клієнтів
     * @private
     */
    setAuthCookies(res, tokens, rememberMe = false) {
        // 1. Налаштування для Access Token
        const accessTokenSettings = config.tokenTypes.access
        const accessCookieTransport = accessTokenSettings.transport.cookie

        const accessOptions = {
            httpOnly: accessCookieTransport.options.httpOnly,
            secure: accessCookieTransport.options.secure,
            sameSite: accessCookieTransport.options.sameSite,
            path: accessCookieTransport.options.path,
            // Якщо НЕ "запам'ятати мене", можна зменшити maxAge або залишити дефолт
            maxAge: rememberMe
                ? accessCookieTransport.options.maxAge
                : accessCookieTransport.options.sessionMaxAge || 1000 * 60 * 15,
        }
        res.cookie(`${accessCookieTransport.name}`, tokens.accessToken, accessOptions)

        // 2. Налаштування для Refresh Token
        const refreshTokenSettings = config.tokenTypes.refresh
        const refreshCookieTransport = refreshTokenSettings.transport.cookie

        const refreshOptions = {
            httpOnly: refreshCookieTransport.options.httpOnly,
            secure: refreshCookieTransport.options.secure,
            sameSite: refreshCookieTransport.options.sameSite,
            path: refreshCookieTransport.options.path,
            // БЕЗПЕКА: Якщо rememberMe false, ставимо короткий maxAge (наприклад, 30 хв, 4 год),
            // замість безстрокової сесійної куки в браузері
            maxAge: rememberMe
                ? refreshCookieTransport.options.maxAge
                : refreshCookieTransport.options.shortMaxAge || 1000 * 60 * 60 * 4,
        }

        // Додаємо maxAge для Refresh ТІЛЬКИ якщо користувач обрав "Запам'ятати мене"
        if (rememberMe) {
            refreshOptions.maxAge = refreshCookieTransport.options.maxAge
        }

        res.cookie(`${refreshCookieTransport.name}`, tokens.refreshToken, refreshOptions)

        // res.cookie('refreshToken', refreshToken, {
        //     httpOnly: true, // Повний захист від витоку через XSS (JS не має доступу)
        //     secure: process.env.NODE_ENV === 'production', // Передача тільки по захищеному HTTPS
        //     sameSite: 'strict', // Захист від CSRF-атак
        //     maxAge: 30 * 24 * 60 * 60 * 1000, // 30 днів (відповідно до логіки бази даних)
        // })
    }

    /**
     * Допоміжний метод для очищення кук автентифікації
     * @private
     */
    clearAuthCookies(res) {
        //
        const getBaseOptions = (cookieConfig) => ({
            path: cookieConfig.options.path,
            domain: cookieConfig.options.domain || undefined,
            secure: cookieConfig.options.secure,
            sameSite: cookieConfig.options.sameSite,
            httpOnly: cookieConfig.options.httpOnly,
        })

        // 1. Очищення Access Token
        const accessCookie = config.tokenTypes.access.transport.cookie
        res.clearCookie(accessCookie.name, {
            path: accessCookie.options.path,
            domain: accessCookie.options.domain || undefined,
            secure: accessCookie.options.secure,
            sameSite: accessCookie.options.sameSite,
            httpOnly: accessCookie.options.httpOnly,
        })

        // 2. Очищення Refresh Token
        const refreshCookie = config.tokenTypes.refresh.transport.cookie
        res.clearCookie(refreshCookie.name, {
            path: refreshCookie.options.path,
            domain: refreshCookie.options.domain || undefined,
            secure: refreshCookie.options.secure,
            sameSite: refreshCookie.options.sameSite,
            httpOnly: refreshCookie.options.httpOnly,
        })
    }

    /**
     * Обробка HTTP-запиту на реєстрацію користувача
     */
    async register(req, res, next) {
        try {
            // Валідація вхідних даних (DTO / Схема)
            const validatedData = AuthSchema.validateRegister(req.body)
            const metadata = this.extractMetadata(req, validatedData)

            // 1. Створюємо користувача в базі
            const registrationResult = await this.authService.register(validatedData)

            // 2. Перевіряємо, чи потрібен автоматичний логін
            if (validatedData.autoLogin === true) {
                // Прямий виклик бізнес-логіки логіну з готовими чистими даними (або робити підміну body і викликати login)
                const authResult = await this.authService.login(
                    {
                        login: validatedData.login,
                        password: validatedData.password,
                        rememberMe: validatedData.rememberMe || false,
                        authType: req.body?.authType || 'DATABASE',
                        appId: req.body?.appId || null,
                    },
                    metadata,
                )

                // Встановлюємо куки
                this.setAuthCookies(res, authResult, validatedData.rememberMe)

                //
                return res.status(201).json({
                    id: registrationResult.id,
                    message: 'Користувача успішно створено та авторизовано',
                    accessToken: authResult.accessToken,
                    refreshToken: authResult.refreshToken,
                    user: authResult.user,
                })
            }

            // Захисний сценарій (Фронтенд не передав поле, або передав false)
            return res.status(201).json({
                id: registrationResult.id,
                message: 'Користувача успішно створено',
            })
        } catch (error) {
            next(error)
        }
    }

    /**
     * Обробка HTTP-запиту на логін
     */
    async login(req, res, next) {
        try {
            const validatedData = AuthSchema.validateLogin(req.body)
            const metadata = this.extractMetadata(req, validatedData)

            // Прокидаємо authType з body запиту (дефолт 'DATABASE')
            const authData = {
                ...validatedData,
                login: validatedData.login,
                password: validatedData.password,
                rememberMe: validatedData.rememberMe,
                authType: req.body?.authType,
                appId: req.body?.appId || null,
            }

            const authResult = await this.authService.login(authData, metadata)

            // Реалізуємо гібридний підхід:
            // 1. Для Веб-браузерів запіхаємо токени у захищені куки
            this.setAuthCookies(res, authResult, validatedData.rememberMe)

            // 2. Для мобільних/десктопних додатків віддаємо обидва токени у тілі JSON
            return res.status(200).json({
                message: 'Користувача успішно авторизовано',
                accessToken: authResult.accessToken,
                refreshToken: authResult.refreshToken,
                user: authResult.user,
            })
        } catch (error) {
            next(error)
        }
    }

    /**
     * Обробка HTTP-запиту на оновлення токенів (Refresh Session)
     */
    async refresh(req, res, next) {
        try {
            const refreshCookieName = config.tokenTypes.refresh.transport.cookie.name
            const tokenFromCookie = req.cookies?.[refreshCookieName]

            // Шукаємо токен у куках (Web), у тілі запиту або у спеціальному заголовку (Mobile)
            const oldRefreshToken =
                tokenFromCookie || req.body?.refreshToken || req.headers['x-refresh-token']

            if (!oldRefreshToken) {
                return res.status(401).json({ error: 'REFRESH_TOKEN_MISSING' })
            }

            const metadata = this.extractMetadata(req)

            // Передаємо інформацію про додаток явно, якщо він прийшов з body/headers
            const appId = req.body?.appId || req.headers['x-app-id'] || null

            const tokens = await this.authService.refreshTokens(oldRefreshToken, {
                ...metadata,
                appId: appId,
            })

            // Оновлюємо куку та JSON відповідь (Ротація токенів)
            // Перевстановлюємо обидва оновлені токени в куки
            this.setAuthCookies(res, tokens, tokens.rememberMe)

            return res.json({
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
            })
        } catch (error) {
            // БЕЗПЕКА: Чистимо куки Web-клієнта ТІЛЬКИ якщо токен прийшов із куки
            // і помилка вказує на компрометацію або прострочення
            const refreshCookieName = config.tokenTypes.refresh.transport.cookie.name
            if (req.cookies?.[refreshCookieName]) {
                this.clearAuthCookies(res)
            }
            next(error)
        }
    }

    /**
     * Обробка HTTP-запиту на вихід (Logout)
     */
    async logout(req, res, next) {
        try {
            const refreshCookieName = config.tokenTypes.refresh.transport.cookie.name

            const refreshToken =
                req.cookies?.[refreshCookieName] ||
                req.body?.refreshToken ||
                req.headers['x-refresh-token']

            if (refreshToken) {
                await this.authService.logout(refreshToken)
            }

            // Видаляємо всі куки автентифікації
            this.clearAuthCookies(res)

            return res.status(200).json({
                message: 'Сесію успішно завершено',
            })
        } catch (error) {
            next(error)
        }
    }

    /**
     * УНІВЕРСАЛЬНИЙ МЕТОД: Отримання короткоживучого токена.
     */
    async getTemporaryToken(req, res, next) {
        try {
            // КЕЙС: Користувач пройшов перевірку по IP
            if (req.isIpBypassed && req.virtualIpUser) {
                const data = {
                    token: req.ip,
                    scope: null,
                    expiresIn: null,
                }

                return res.status(200).json(data)
            }

            //
            const { scope, expiresIn = '30s' } = req.body

            // req.user заповнюється вашим головним AuthMiddleware (перевірка базового accessToken)
            if (!req.user) {
                throw CustomError.Unauthorized('Користувача не ідентифіковано')
            }

            if (!scope) {
                throw CustomError.BadRequest(
                    "Параметр 'scope' є обов'язковим (наприклад: WEBSOCKET, FILE_DOWNLOAD)",
                )
            }

            // Дозволяємо лише безпечні короткі ліміти для тимчасових токенів
            const allowedTimeRegex = /^([1-9][0-9]?s|[1-5]m)$/ // від 1s до 99s, або від 1m до 5m
            if (!allowedTimeRegex.test(expiresIn)) {
                throw CustomError.BadRequest("Невалідний формат часу. Дозволено від '1s' до '5m'.")
            }

            const result = await this.authService.generateTemporaryToken(
                req.user, // передаємо повний payload поточного access токена
                scope,
                expiresIn,
            )

            return res.status(200).json(result)
        } catch (error) {
            next(error)
        }
    }

    /**
     * Для внутрішнього використання іншими сервісами/серверами
     */
    async verifyTemporaryToken(req, res, next) {
        try {
            const { token, scope } = req.body

            if (!token || !scope) {
                throw CustomError.BadRequest(
                    "Параметри 'token' та 'scope' є обов'язковими в тілі запиту",
                )
            }

            // Перевіряємо токен через сервіс
            const payload = await this.authService.verifyTemporaryToken(token, scope)

            // Повертаємо true та чистий payload користувача
            return res.status(200).json({
                valid: true,
                data: payload, // містить копію всіх полів користувача
            })
        } catch (error) {
            next(error)
        }
    }

    /**
     * Ендпоінт для сторонніх сервісів (Token Introspection) - verify
     * Перевіряє валідність Access токена та повертає статус і дані користувача
     */
    async introspect(req, res, next) {
        try {
            // Шукаємо токен у заголовку Authorization (Bearer токен від сторонніх сервісів)
            // Або у відповідній куці (якщо запит іде від внутрішнього фронтенду без middleware)
            const accessCookieName = config.tokenTypes.access.transport.cookie.name

            let token =
                req.headers['authorization']?.split(' ')[1] ||
                req.cookies?.[accessCookieName] ||
                req.body?.token

            if (!token) {
                return res.status(400).json({
                    active: false,
                    error: 'TOKEN_MISSING',
                })
            }

            // Делегуємо перевірку токена бізнес-сервісу
            const tokenData = await this.authService.validateAccessToken(token)

            // Повертаємо структуру згідно з RFC 7662
            return res.json({
                active: true,
                // sub: tokenData.userId,
                // user: tokenData.user,
                // exp: tokenData.exp || null,
                data: tokenData,
            })
        } catch (error) {
            next(error)
        }
    }

    // ---
    // /**
    //  * POST /auth/change-password
    //  */
    // async changePassword(req, res) {
    //     try {
    //         const userId = req.user.id // з authMiddleware
    //         const { oldPassword, newPassword } = req.body

    //         if (!oldPassword || !newPassword) {
    //             return res.status(400).json({ error: 'Передайте старий та новий паролі' })
    //         }

    //         await this.authService.changePassword(userId, oldPassword, newPassword)

    //         // Оскільки ми скинули всі сесії на інших пристроях, для поточної куки теж краще зробити clear
    //         res.clearCookie('refreshToken')
    //         return res
    //             .status(200)
    //             .json({ message: 'Пароль успішно змінено. Перезайдіть у додаток' })
    //     } catch (error) {
    //         if (error.message === 'INVALID_OLD_PASSWORD') {
    //             return res.status(400).json({ error: 'Поточний пароль вказано невірно' })
    //         }
    //         return res.status(500).json({ error: 'Не вдалося змінити пароль' })
    //     }
    // }

    // /**
    //  * POST /auth/forgot-password
    //  */
    // async forgotPassword(req, res) {
    //     try {
    //         const { email } = req.body

    //         if (!email) {
    //             return res.status(400).json({ error: 'Email є обовʼязковим' })
    //         }

    //         const resetToken = await this.authService.forgotPassword(email)

    //         // БЕЗПЕКА: Навіть якщо resetToken === null (користувача немає), фронтенду кажемо 200 OK.
    //         // Це захищає систему від сканування бази на наявність емейлів зловмисниками.
    //         if (resetToken) {
    //             // Тут логіка відправки листа на пошту (наприклад, через MailerService)
    //             // mailerService.sendResetLink(email, resetToken);
    //             console.log(`[EMAIL SIMULATION] Надіслано токен на ${email}: ${resetToken}`)
    //         }

    //         return res
    //             .status(200)
    //             .json({ message: 'Якщо цей email зареєстрований, інструкцію надіслано на пошту' })
    //     } catch (error) {
    //         return res.status(500).json({ error: 'Помилка відновлення паролю' })
    //     }
    // }

    // /**
    //  * POST /auth/reset-password
    //  */
    // async resetPassword(req, res) {
    //     try {
    //         const { token, newPassword } = req.body

    //         if (!token || !newPassword) {
    //             return res.status(400).json({ error: 'Токен та новий пароль є обовʼязковими' })
    //         }

    //         await this.authService.resetPassword(token, newPassword)
    //         res.clearCookie('refreshToken')

    //         return res
    //             .status(200)
    //             .json({ message: 'Пароль успішно оновлено. Тепер ви можете увійти' })
    //     } catch (error) {
    //         if (error.message === 'INVALID_OR_EXPIRED_RESET_TOKEN') {
    //             return res
    //                 .status(400)
    //                 .json({ error: 'Токен відновлення недійсний або його термін дії вичерпано' })
    //         }
    //         return res.status(500).json({ error: 'Не вдалося скинути пароль' })
    //     }
    // }
}
