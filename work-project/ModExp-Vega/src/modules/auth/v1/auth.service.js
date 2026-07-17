import bcrypt from 'bcrypt'
import { CustomError } from '../../../common/utils/CustomError.js'

export class AuthService {
    /**
     * @param {Object} authRepository - Локальний репозиторій (для PL/SQL функцій бази Oracle)
     * @param {Object} sessionRepository - Репозиторій сесій з SessionModule
     * @param {Object} userRepository - Репозиторій користувачів з UserModule
     * @param {Object} tokenService - Менеджер токенів
     */
    constructor(authRepository, sessionRepository, userRepository, tokenService) {
        this.authRepository = authRepository
        this.sessionRepository = sessionRepository
        this.userRepository = userRepository
        this.tokenService = tokenService
    }

    // /**
    //  * Реєстрація нового користувача
    //  */
    // async register(data) {
    //     const { login, email, password } = data

    //     // 1. Перевіряємо, чи логін або email уже зайняті
    //     const existingUser = await this.userRepository.findUserByLogin(login)
    //     if (existingUser) throw new Error('USER_ALREADY_EXISTS')

    //     // const existingEmail = await this.userRepository.findUserByEmail(email)
    //     // if (existingEmail) throw new Error('EMAIL_ALREADY_EXISTS')

    //     // 2. Хешуємо пароль (10 раундів — оптимально за балансом швидкість/безпека)
    //     const passwordHash = await bcrypt.hash(password, 10)

    //     // 3. Зберігаємо в базу через UserRepository
    //     return await this.userRepository.createUser({
    //         ...data,
    //         passwordHash,
    //     })
    // }

    /**
     * Спільно використовуваний метод для генерації токенів, запису сесії в БД та контролю лімітів
     * @private
     */
    async _createSession(user, { authType, rememberMe, appId = null }, metadata) {
        // 1. ПЕРЕВІРКА ДОСТУПУ ДО ДОДАТКА (Єдина точка захисту)
        // Отримуємо актуальні права з бази, якщо вони ще не були завантажені раніше
        const allowedApps =
            user.ALLOWED_APPS || (await this.userRepository.getUserAllowedApps(user.USERNAME))

        if (appId && !allowedApps.includes(appId)) {
            throw CustomError.Forbidden('У вас немає дозволу на використання цього додатка', {
                reason: 'APPLICATION_ACCESS_DENIED',
            })
        }

        // // Успішный вхід (будь-яким способом) — скидаємо лічильник помилок та оновлюємо дату входу
        // await this.userRepository.resetFailedAttempts(user.ID)

        // 1. Формування ПІБ (Ініціали)
        const initials = [
            user.FAMILIA || '',
            user.IMYA ? `${user.IMYA[0]}.` : '',
            user.OTCHESTVO ? `${user.OTCHESTVO[0]}.` : '',
        ]
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()

        // 2. Створення базового плоского payload користувача
        const userPayload = {
            userId: user.ID,
            login: user.USERNAME,
            tab_no: user.TAB_NO,
            name: initials,
            roles: user?.USER_ROLES || [],
            allowedApps: allowedApps,
            firstName: user.IMYA,
            lastName: user.FAMILIA,
            middleName: user.OTCHESTVO,
        }

        // 3. Підготовка опцій для JWT
        const jti = this.tokenService.generateJti()
        const tokenOptions = {
            subject: user.USERNAME,
            jti,
            audience: appId,
        }

        const tokenPayload = {
            ...userPayload,
            authType,
            rememberMe,
            sid: jti,
            aud: appId,
        }

        // 4. Паралельна генерація токенів
        const [{ accessToken }, { refreshToken, expiresAt }] = await Promise.all([
            this.tokenService.generateAccessToken(tokenPayload, tokenOptions),
            this.tokenService.generateRefreshToken(tokenPayload, tokenOptions),
        ])

        // 5. Хешування та збереження сесії в Oracle
        const refreshTokenHash = this.tokenService.hashToken(refreshToken)
        await this.sessionRepository.saveRefreshToken({
            userId: userPayload.userId,
            login: userPayload.login,
            appId: appId,
            tokenHash: refreshTokenHash,
            jti,
            parentJti: null,
            userAgent: metadata.userAgent,
            ipAddress: metadata.ipAddress,
            deviceFingerprint: metadata.deviceFingerprint,
            rotationCount: 0,
            expiresAt,
        })

        // 6. Контроль ліміту одночасних сесій
        const maxActiveSessions =
            user.MAX_ACTIVE_SESSIONS === undefined ? 1 : user.MAX_ACTIVE_SESSIONS

        await this.sessionRepository.enforceSessionLimit(
            userPayload.userId,
            appId,
            maxActiveSessions,
        )

        return {
            accessToken,
            refreshToken,
            user: userPayload,
        }
    }

    /**
     * Аутентифікація (Вхід у систему)
     */
    async login(
        { login, password, appId = null, rememberMe = false, authType = 'DATABASE' },
        metadata,
    ) {
        // 1. Пошук користувача
        const user = await this.userRepository.findUserByLogin(login)

        // ЗАХИСТ ВІД TIMING-АТАК: Якщо юзера немає, ми все одно крутимо bcrypt «вхолосту»
        if (!user) {
            const dummyHash = '$2b$10$EpRshY9XqA6E8GdB1Mubm.eKWzS1p7M3H1O2c3V4e5R6t7Y8u9I0o'
            await bcrypt.compare(password, dummyHash)
            // Універсальна помилка для безпеки, щоб не палити наявність логіну
            // throw new Error('INVALID_CREDENTIALS')
            throw CustomError.Unauthorized('Невірний логін або пароль')
        }

        // 2. Перевірка статусу блокування акаунту
        if (user.IS_ACTIVE === 0) {
            // throw new Error('ACCOUNT_BANNED')
            throw CustomError.Forbidden('Ваш обліковий запис заблоковано', {
                reason: 'ACCOUNT_BANNED',
            })
        }

        // 3. Перевірка Brute-Force блокування за часом
        if (user.LOCKED_UNTIL && new Date(user.LOCKED_UNTIL) > new Date()) {
            // throw new Error('ACCOUNT_LOCKED')
            throw CustomError.Forbidden(
                'Акаунт тимчасово заблоковано через велику кількість помилок',
                {
                    reason: 'ACCOUNT_LOCKED',
                },
            )
        }

        // 4. Валідація (Перевірка) пароля залежно від типу автентифікації
        // ГІБРИДНА ВАЛІДАЦІЯ ПАРОЛЯ ЗАЛЕЖНО ВІД ТИПУ
        if (authType === 'APPLICATION') {
            // ================================================================
            // СПОСІБ А: Стандартна перевірка хешу пароля Bcrypt у табл. USERS
            // ================================================================
            const isPasswordValid = await bcrypt.compare(password, user.PASSWORD_HASH)
            if (!isPasswordValid) {
                // Фіксуємо невдалу спробу. Якщо вона 5-та — репозиторій сам заблокує акаунт
                // await this.userRepository.incrementFailedAttempts(user.ID)

                // throw new Error('INVALID_CREDENTIALS')
                throw CustomError.Unauthorized('Невірний логін або пароль')
            }
        } else {
            // ================================================================
            // СПОСІБ Б: Перевірка через нативний акаунт самої СУБД Oracle
            // ================================================================

            const isOraclePasswordValid = await this.authRepository.verifyOracleDbUser(
                login,
                password,
            )

            if (!isOraclePasswordValid) {
                // Оскільки користувач є в USERS, ми нативно захищаємо базу від брутфорсу
                // await this.userRepository.incrementFailedAttempts(user.ID)

                // throw new Error('ORACLE_DB_INVALID_CREDENTIALS')
                throw CustomError.Unauthorized(
                    'Невірний логін або пароль облікових даних Oracle СУБД',
                )
            }
        }

        // 5. Створення сесії
        return this._createSession(user, { authType, rememberMe, appId }, metadata)
    }

    /**
     * Публічний метод сервісу для наскрізного входу за токеном з URL
     */
    async loginViaSsoToken({ login, tokenPayload, appId }, metadata) {
        const user = await this.userRepository.findUserByLogin(login)

        // Повна перевірка стану акаунту користувача перед входом
        if (!user || user.IS_ACTIVE === 0) {
            throw CustomError.Unauthorized(
                'Обліковий запис не знайдено або заблоковано в системі.',
                {
                    reason: 'USER_NOT_FOUND',
                },
            )
        }

        if (user.LOCKED_UNTIL && new Date(user.LOCKED_UNTIL) > new Date()) {
            throw CustomError.Forbidden('Акаунт тимчасово заблоковано через Brute-Force ліміти', {
                reason: 'ACCOUNT_LOCKED',
            })
        }

        // Викликаємо ваш приватний внутрішній метод створення сесії в Oracle СУБД
        return this._createSession(
            user,
            {
                authType: tokenPayload.authType || 'DATABASE',
                rememberMe: tokenPayload.rememberMe ?? false,
                appId,
            },
            metadata,
        )
    }

    /**
     * Оновлює пару Access та Refresh токенів з використанням механізму ротації та вікна Grace Period.
     * @param {string} jwtRefreshToken - Поточний Refresh токен у форматі JWT
     * @param {Object} metadata - Метадані запиту для безпеки
     * @param {string|null} [metadata.appId=null] - Ідентифікатор додатка
     * @param {string} metadata.userAgent - User-Agent клієнта
     * @param {string} metadata.ipAddress - IP-адреса клієнта
     * @param {string|null} [metadata.deviceFingerprint=null] - Цифровий відбиток пристрою
     * @returns {Promise<Object>} Нова пара токенів { accessToken, refreshToken, rememberMe }
     */
    async refreshTokens(jwtRefreshToken, metadata) {
        // 1. Валідація токена на рівні JWT (підпис, строк дії структури)
        const payload = await this.tokenService.verifyRefreshToken(jwtRefreshToken).catch((err) => {
            throw CustomError.from(err)
        })

        // 2. Хешуємо отриманий рядок і шукаємо сесію в сховищі
        const tokenHash = this.tokenService.hashToken(jwtRefreshToken)

        // 2. Пошук сесії з урахуванням Grace Period для запобігання Race Conditions
        // Шукаємо токен в базі. Якщо він відкликаний менше ніж Х секунд тому з причиною 'rotated' —
        // метод findRotatedSessionWithGrace відразу поверне його, використовуючи точний час Oracle СУБД.
        const gracePeriodSeconds = 15 // Час вікна благодаті (15 секунд)
        const session = await this.sessionRepository.findSessionForRefresh(
            tokenHash,
            gracePeriodSeconds,
        )

        if (!session) {
            // throw new Error('UNAUTHORIZED')
            throw CustomError.Unauthorized(
                'Сесію не знайдено або термін пільгового періоду закінчився',
            )
        }

        // Заздалегідь готуємо базовий payload для перевипуску токенів
        // Створюємо новий payload на основі даних з розкодованого токена, без зайвих JOIN/SELECT до бази
        const tokenPayload = {
            ...payload,
            userId: session.USER_ID,
            login: session.USER_LOGIN,
            tab_no: payload.tab_no,
            name: payload.name,
            roles: payload.roles,
            allowedApps: payload.allowedApps,
            firstName: payload.firstName,
            lastName: payload.lastName,
            middleName: payload.middleName,
            authType: payload.authType,
            rememberMe: payload.rememberMe,
            sid: payload.sid,
            aud: payload.aud,
        }

        const currentApp = metadata.appId || session.APP_ID || null

        // 3. Обробка Grace Period (якщо сесію вже було позначено як rotated)
        // Захист від повторного використання (Token Reuse Detection) та обробка мережевих розривів (GRACE PERIOD)
        if (session.REVOKED_AT !== null) {
            // Вираховуємо, скільки секунд минуло з моменту відкликання токена
            const revokedTime = new Date(session.REVOKED_AT)
            const now = new Date()
            const secondsSinceRevocation = (now.getTime() - revokedTime.getTime()) / 1000

            if (session.REVOKE_REASON === 'rotated' || session.IS_GRACE_VALID === 1) {
                // Мережевий розрив підтверджено базою даних!
                // Знаходимо вже створеного у минулому (успішному) запиті нащадка
                const childSession = await this.sessionRepository.findChildSessionByParentJti(
                    session.JTI,
                )

                if (childSession) {
                    // Найбільш стабільний варіант для UX:
                    // Генеруємо СВІЖИЙ Access Token (бо вони короткочасні і безпечні),
                    // але Refresh-токен перевипускаємо з ТИМ САМИМ JTI, оновлюючи його хеш,
                    // щоб не плодити нові гілки під час повторних спам-запитів від клієнта.

                    // Оскільки чистий рядок нового Refresh JWT в базу не пишемо (там лише хеш),
                    // бекенд не може дістати його з Oracle і знову віддати клієнту.
                    // ТОМУ У ВІКНІ БЛАГОДАТІ ми генеруємо ще один новий токен для цієї ж сесії (childSession.JTI),
                    // але ОНОВЛЮЄМО його хеш в базі, щоб клієнт отримав свіжу робочу пару.
                    const tokenOptions = {
                        subject: payload.sub,
                        jti: childSession.JTI, // Зберігаємо той самий JTI нащадка
                        audience: payload.aud,
                        // ІДЕОЛОГІЧНО ВАЖЛИВО: фіксуємо час iat (в секундах),
                        // щоб JWT рядок згенерувався ТОЧНО таким же, як і вперше!
                        // Для цього у SELECT запиті findChildSessionByParentJti
                        // витягуємо дату створення (наприклад, CREATED_AT або REFRESH_TOKENS.EXPIRES_AT - ліміт життя)
                        iat: Math.floor(new Date(childSession.CREATED_AT).getTime() / 1000),
                        exp: Math.floor(new Date(childSession.EXPIRES_AT).getTime() / 1000),
                    }

                    const { accessToken: retryAccessToken } =
                        await this.tokenService.generateAccessToken(tokenPayload, tokenOptions)
                    const { refreshToken: retryRefreshToken, expiresAt: retryExpiresAt } =
                        await this.tokenService.generateRefreshToken(tokenPayload, tokenOptions)

                    // const retryTokenHash = this.tokenService.hashToken(retryRefreshToken)

                    // // Оновлюємо хеш для існуючого нащадка (захищає від Race Conditions при 3+ одночасних запитах)
                    // await this.sessionRepository.updateTokenHash(
                    //     childSession.ID,
                    //     retryTokenHash,
                    //     retryExpiresAt,
                    // )

                    return {
                        accessToken: retryAccessToken,
                        refreshToken: retryRefreshToken,
                        rememberMe: payload.rememberMe,
                    }
                }
            }

            // Якщо токен відкликаний з іншої причини, або 15 секунд давно минули — це атака Reuse Attack
            // Якщо час вікна благодаті (15 сек) вже минув — це 100% спроба зламу (хакер вкрав старий токен)
            // Хтось намагається використати вже замінений або анульований токен.
            // Негайно блокуємо ВСІ сесії, що пішли від цієї гілки (rootJti = session.JTI)
            await this.sessionRepository.revokeCompromisedChain(
                session.JTI,
                'compromised_chain_reuse',
            )

            // throw new Error('TOKEN_COMPROMISED')
            throw CustomError.Forbidden(
                'Спроба повторного використання токена. Сесію скомпрометовано.',
                { reason: 'TOKEN_COMPROMISED' },
            )
        }

        // 4. Захист від Session Hijacking (Перевірка зміни заліза)
        if (
            session.DEVICE_FINGERPRINT &&
            session.DEVICE_FINGERPRINT !== metadata.deviceFingerprint
        ) {
            await this.sessionRepository.revokeCompromisedChain(session.JTI, 'fingerprint_mismatch')

            // throw new Error('SECURITY_VIOLATION')
            throw CustomError.Forbidden('Критична зміна цифрового зліпка пристрою.', {
                reason: 'SECURITY_VIOLATION',
            })
        }

        // 5. Перевірка терміну дії (TTL) в базі (про всяк випадок, якщо JWT expired не відловив)
        if (new Date(session.EXPIRES_AT) < new Date()) {
            await this.sessionRepository.revokeToken(session.ID, 'expired')

            // throw new Error('UNAUTHORIZED')
            throw CustomError.Unauthorized('Термін дії сесії оновлення закінчився')
        }

        // 6. Успішна ротація: маркуємо поточний токен як успішно замінений (rotated)
        await this.sessionRepository.revokeToken(session.ID, 'rotated')

        // 7. Створюємо абсолютно нову пару токенів для наступного кроку
        const newJti = this.tokenService.generateJti()

        const tokenOptions = {
            subject: payload.sub,
            jti: newJti,
            audience: payload.aud,
        }

        const { accessToken: newAccessToken } = await this.tokenService.generateAccessToken(
            tokenPayload,
            tokenOptions,
        )
        const { refreshToken: newRefreshToken, expiresAt: newExpiresAt } =
            await this.tokenService.generateRefreshToken(tokenPayload, tokenOptions)

        const newTokenHash = this.tokenService.hashToken(newRefreshToken)

        // Зберігаємо нову сесію в ланцюжку, інкрементуючи лічильник ротацій
        await this.sessionRepository.saveRefreshToken({
            userId: session.USER_ID,
            login: session.USER_LOGIN,
            appId: currentApp,
            tokenHash: newTokenHash,
            jti: newJti,
            parentJti: session.JTI,
            userAgent: metadata.userAgent,
            ipAddress: metadata.ipAddress,
            deviceFingerprint: metadata.deviceFingerprint,
            rotationCount: (session.ROTATION_COUNT || 0) + 1,
            expiresAt: newExpiresAt,
        })

        // 9. Застосовуємо ліміт сесій для цього додатка (щоб не накопичувати сміття)
        // Наприклад, дозволяємо максимум X одночасних пристроїв для цього користувача в рамках одного appId
        const maxActiveSessions =
            session.MAX_ACTIVE_SESSIONS === undefined ? 1 : session.MAX_ACTIVE_SESSIONS

        await this.sessionRepository.enforceSessionLimit(
            session.USER_ID,
            currentApp,
            maxActiveSessions,
        )

        return {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            rememberMe: payload.rememberMe,
        }
    }

    /**
     * Вихід із системи (Logout)
     */
    async logout(jwtRefreshToken) {
        if (!jwtRefreshToken) return

        // 1. Декодуємо токен (verify тут можна не робити, або зробити м'який,
        // адже навіть якщо у JWT закінчився термін дії, ми все одно хочемо закрити його в базі)
        const tokenHash = this.tokenService.hashToken(jwtRefreshToken)

        // 2. Блокуємо та читаємо рядок сесії для захисту від паралельних запитів
        const session = await this.sessionRepository.findRefreshTokenByHash(tokenHash)

        // Якщо сесії вже немає в базі (наприклад, її видалив Cron-очищувач) — вважаємо, що вихід успішний
        if (!session) {
            return
        }

        // 3. Якщо сесія вже відкликана раніше — нічого не робимо (ідемпотентний вихід)
        if (session.REVOKED_AT !== null) {
            return
        }

        // 4. Маркуємо сесію в базі як успішно закриту користувачем
        await this.sessionRepository.revokeToken(session.ID, 'logout')
    }

    /**
     * Завершує всі сесії користувача у всіх додатках, окрім тієї, з якої надіслано запит.
     * @param {string} currentJwtRefreshToken - Поточний Refresh токен користувача
     * @returns {Promise<void>}
     */
    async logoutFromOtherDevices(currentJwtRefreshToken) {
        const tokenHash = this.tokenService.hashToken(currentJwtRefreshToken)
        const session = await this.sessionRepository.findRefreshTokenByHash(tokenHash)

        if (!session || session.REVOKED_AT !== null) {
            throw CustomError.Unauthorized('Поточна сесія недійсна')
        }

        // Закриваємо всі сесії цього USER_ID, де JTI не дорівнює поточному
        await this.sessionRepository.revokeAllSessionsByUserIdExceptCurrent(
            session.USER_ID,
            session.JTI,
            'logout_other_devices',
        )
    }

    /**
     * Валідація access токена для внутрішнього використання та сторонніх сервісів
     * @param {string} token - JWT Access Token
     */
    async validateAccessToken(token) {
        try {
            // 1. Декодуємо та перевіряємо підпис токена через tokenService
            // Припустимо, він викидає помилку, якщо токен протух чи підпис невалідний
            const payload = await this.tokenService.verifyAccessToken(token)

            if (!payload || !payload.userId) {
                throw new CustomError('INVALID_TOKEN_PAYLOAD', 401)
            }

            // 2. Витягуємо актуальні дані користувача з репозиторію
            const user = await this.userRepository.findById(payload.userId)
            if (!user) {
                throw new CustomError('USER_NOT_FOUND', 404)
            }

            // // 3. Перевіряємо чи користувач активний/не забанений (опціонально)
            // if (user.status !== 'ACTIVE') {
            //     throw new CustomError('USER_INACTIVE', 403)
            // }

            return {
                userId: user.id,
                exp: payload.exp,
                user: {
                    id: user.id,
                    login: user.login,
                    email: user.email,
                    roles: user.roles || [],
                },
            }
        } catch (error) {
            // Перехоплюємо помилки бібліотек JWT та перетворюємо у зрозумілий CustomError
            throw new CustomError(error.message || 'ACCESS_TOKEN_VALIDATION_FAILED', 401)
        }
    }

    /**
     * УНІВЕРСАЛЬНИЙ МЕТОД: Генерація короткоживучого одноразового токена (Exchange Token)
     * @param {Object} currentAccessTokenPayload - Декодований payload поточного access-токена
     * @param {String} targetScope - Для чого випускається ("WEBSOCKET", "FILE_DOWNLOAD", "RECONSTRUCT_SESSION")
     * @param {String} [expiresIn="30s"] - Час життя токена (за замовчуванням 30 секунд)
     */
    async generateTemporaryToken(currentAccessTokenPayload, targetScope, expiresIn = '30s') {
        if (!targetScope) {
            throw CustomError.BadRequest(
                'Не вказано область застосування (scope) тимчасового токена',
            )
        }

        // 1. Очищаємо payload від старих системних JWT-полів, щоб вони не конфліктували з новими
        // Усі інші поля (userId, roles, name, tab_no тощо) автоматично потраплять в об'єкт payload
        const { iat, exp, nbf, jti, tokenType, scope, ...payload } = currentAccessTokenPayload

        // 1. Формуємо універсальний payload, копіюючи дані користувача
        const tempPayload = {
            ...payload,
            // КРИТИЧНО ДЛЯ УНІВЕРСАЛЬНОСТІ:
            tokenType: 'TEMPORARY_EXCHANGE_TOKEN',
            scope: targetScope, // Наприклад: "WEBSOCKET", "FILE_DOWNLOAD"
        }

        // 2. Прив'язуємо до батьківського JTI для контролю сесії через БД Oracle
        const parentJti = currentAccessTokenPayload.jti

        const tokenOptions = {
            subject: payload.name,
            jti: parentJti, // використовуємо той самий jti або генеруємо новий, якщо потрібно відстежувати окремо
            expiresIn: expiresIn, // Передаємо час життя ("30s", "1m", "5m" для файлів)
        }

        // 3. Генеруємо токен через tokenService з кастомним часом життя
        const { accessToken: temporaryToken } = await this.tokenService.generateAccessToken(
            tempPayload,
            tokenOptions,
        )

        return {
            token: temporaryToken,
            scope: targetScope,
            expiresIn,
        }
    }

    /**
     * УНІВЕРСАЛЬНИЙ МЕТОД: Валідація тимчасового токена
     * @param {String} tempToken - Сам токен
     * @param {String} requiredScope - Область, для якої перевіряється токен ("WEBSOCKET", "FILE_DOWNLOAD")
     */
    async verifyTemporaryToken(tempToken, requiredScope) {
        try {
            // 1. Стандартна JWT перевірка підпису та строку дії (expired)
            const payload = await this.tokenService.verifyAccessToken(tempToken)

            // 2. Валідація типу токена
            if (payload.tokenType !== 'TEMPORARY_EXCHANGE_TOKEN') {
                throw CustomError.Unauthorized(
                    'Невалідний тип токена. Очікується тимчасовий токен.',
                )
            }

            // 3. Валідація області застосування (Захист від використання токена файлу для WS)
            if (payload.scope !== requiredScope) {
                throw CustomError.Forbidden(
                    `Цей токен не призначений для області: ${requiredScope}`,
                )
            }

            // 4. Перевірка статусу сесії в базі даних Oracle через JTI
            if (payload.jti) {
                const session = await this.sessionRepository.findSessionByJti(payload.jti)

                if (!session || session.REVOKED_AT !== null) {
                    throw CustomError.Forbidden('Головна сесія користувача була анульована')
                }
            }

            // Повертаємо payload для бізнес-логіки
            return payload
        } catch (err) {
            next(err)
        }
    }

    // // ----
    // /**
    //  * 6. Зміна пароля авторизованим користувачем (зсередини профілю)
    //  * @param {number} userId
    //  * @param {string} oldPassword
    //  * @param {string} newPassword
    //  */
    // async changePassword(userId, oldPassword, newPassword) {
    //     // Отримуємо поточного користувача через UserRepository
    //     const user = await this.userRepository.findById(userId)

    //     // Викликаємо PL/SQL процедуру валідації старого та збереження нового паролю
    //     const isUpdated = await this.authRepository.updateUserPasswordInDb(
    //         user.email,
    //         oldPassword,
    //         newPassword,
    //     )
    //     if (!isUpdated) {
    //         throw new Error('INVALID_OLD_PASSWORD')
    //     }

    //     // БЕЗПЕКА: Після зміни паролю видаляємо ВСІ сесії користувача на інших пристроях
    //     await this.sessionRepository.deleteAllSessionsForUser(userId)
    // }

    // /**
    //  * 7. Запит на відновлення пароля (Користувач забув пароль)
    //  * @param {string} email
    //  * @returns {Promise<string>} temporaryToken (який потім відправиться у фоні по Email)
    //  */
    // async forgotPassword(email) {
    //     const user = await this.userRepository.findByEmail(email)
    //     if (!user) {
    //         // Заради безпеки (User Enumeration attack) краще не казати, що емейлу немає.
    //         // Просто повертаємо generic статус або null, а контролер відповість "Перевірте пошту".
    //         return null
    //     }

    //     // Генеруємо тимчасовий токен спеціально для скидання пароля (наприклад, на 15 хвилин)
    //     const resetToken = this.tokenService.generateShortLivedToken(
    //         { userId: user.id, purpose: 'password_reset' },
    //         '15m',
    //     )
    //     await this.authRepository.saveTemporaryToken(resetToken, user.id, 'password_reset', 15) // 15 хв ліміт в БД

    //     return resetToken
    // }

    // /**
    //  * 8. Скидання пароля за допомогою токена з пошти
    //  * @param {string} temporaryToken
    //  * @param {string} newPassword
    //  */
    // async resetPassword(temporaryToken, newPassword) {
    //     // Валідуємо токен через наш же introspect
    //     const introspection = await this.introspect(temporaryToken)

    //     if (!introspection.active || introspection.payload.purpose !== 'password_reset') {
    //         throw new Error('INVALID_OR_EXPIRED_RESET_TOKEN')
    //     }

    //     const userId = introspection.payload.userId

    //     // Оновлюємо пароль напряму через PL/SQL (тут старий пароль не потрібен, бо є токен перевірки)
    //     await this.authRepository.forceUpdatePasswordInDb(userId, newPassword)

    //     // Спалюємо токен відновлення, щоб його не використати вдруге
    //     await this.authRepository.deleteTemporaryToken(temporaryToken)

    //     // Повний logout з усіх пристроїв (старий пароль міг бути скомпрометований)
    //     await this.sessionRepository.deleteAllSessionsForUser(userId)
    // }
}
