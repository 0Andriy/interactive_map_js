// auth.service.js
import bcrypt from 'bcrypt'

/**
 * Сервіс автентифікації.
 * Керує життєвим циклом сесії користувача.
 */
class AuthService {
    /**
     * @param {UserService} userService - Сервіс користувачів
     * @param {TokenService} tokenService - Криптографічний сервіс (jose)
     * @param {AuthRepository} authRepository - Репозиторій сесій Oracle
     */
    constructor(userService, tokenService, authRepository) {
        this.userService = userService
        this.tokenService = tokenService
        this.authRepository = authRepository
    }

    /**
     * Реєстрація (делегування до модуля User)
     */
    async register(userData) {
        // Вся логіка створення в UserModule, Auth лише викликає її
        return await this.userService.createUser(userData)
    }

    /**
     * Вхід у систему з генерацією та збереженням токенів
     * @param {string} username
     * @param {string} password
     * @param {string} ipAddress
     */
    async login(username, password, ipAddress) {
        // 1. Знаходимо користувача за логіном
        const user = await this.userService.getUserByUsername(username)

        // 2. Перевіряємо пароль через [bcrypt](https://www.npmjs.com)
        const isMatch = await bcrypt.compare(password, user.password)
        if (!isMatch) {
            throw new Error('Невірний логін або пароль')
        }

        // 3. Формуємо Payload для JWT
        const payload = {
            sub: user.id,
            username: user.username,
            roles: user.roles.map((r) => r.name),
        }

        // 4. Генеруємо токени (Access та Refresh) через [jose](https://www.npmjs.com)
        const accessToken = await this.tokenService.generateToken(payload, '1h')
        const refreshToken = await this.tokenService.generateToken({ sub: user.id }, '30d')

        // 5. Розраховуємо дату експірації для бази Oracle
        const expiresAt = new Date()
        expiresAt.setHours(expiresAt.getHours() + 1)

        // 6. Зберігаємо сесію в БД (Stateful JWT)
        await this.authRepository.saveSession({
            userId: user.id,
            token: accessToken,
            refreshToken: refreshToken,
            expiresAt,
            ipAddress,
        })

        return {
            accessToken,
            refreshToken,
            user: user.toJSON(),
        }
    }

    /**
     * Вихід із системи (анулювання токена в Oracle)
     * @param {string} token
     */
    async logout(token) {
        const success = await this.authRepository.deleteSession(token)
        if (!success) {
            throw new Error('Сесію не знайдено або вже анульовано')
        }
        return { message: 'Вихід успішний' }
    }

    /**
     * Оновлення пари токенів (Refresh Strategy)
     * @param {string} refreshToken
     */
    async refreshTokens(refreshToken) {
        // 1. Перевірка криптографії
        const payload = await this.tokenService.verifyToken(refreshToken)

        // 2. Пошук сесії в Oracle за refresh_token
        const session = await this.authRepository.findSessionByRefreshToken(refreshToken)
        if (!session) throw new Error('Сесія не знайдена')

        // 3. Отримання свіжих даних користувача
        const user = await this.userService.getUser(payload.sub)

        // 4. Генерація нової пари
        const newPayload = {
            sub: user.id,
            username: user.username,
            roles: user.roles.map((r) => r.name),
        }
        const accessToken = await this.tokenService.generateToken(newPayload, '1h')
        const newRefreshToken = await this.tokenService.generateToken({ sub: user.id }, '30d')

        // 5. Ротація токенів в БД (видаляємо стару сесію, створюємо нову)
        await this.authRepository.deleteSessionByRefresh(refreshToken)
        await this.authRepository.saveSession({
            userId: user.id,
            token: accessToken,
            refreshToken: newRefreshToken,
            expiresAt: new Date(Date.now() + 3600000), // +1h
            ipAddress: session.IP_ADDRESS, // зберігаємо IP з попередньої сесії
        })

        return { accessToken, refreshToken: newRefreshToken }
    }

    /**
     * Зміна пароля
     * @param {number} userId
     * @param {string} oldPassword
     * @param {string} newPassword
     */
    async changePassword(userId, oldPassword, newPassword) {
        const user = await this.userService.getUserWithPassword(userId)

        const isMatch = await bcrypt.compare(oldPassword, user.password)
        if (!isMatch) throw new Error('Старий пароль невірний')

        await this.userService.updatePassword(userId, newPassword)

        // Security Best Practice: розлогінюємо всі пристрої після зміни пароля
        await this.authRepository.deleteAllUserSessions(userId)

        return { success: true }
    }

    /**
     * Перевірка валідності токена через БД та криптографію
     * @param {string} token
     */
    async validateSession(token) {
        // Спочатку перевіряємо, чи є токен у "білому списку" Oracle
        const session = await this.authRepository.findSessionByToken(token)
        if (!session) {
            throw new Error('Сесія недійсна або була відкликана')
        }

        // Потім перевіряємо криптографічний підпис через jose
        return await this.tokenService.verifyToken(token)
    }

    /**
     * Перевіряє токен на валідність.
     * Використовується для зовнішніх запитів або внутрішньої перевірки.
     * @param {string} token - JWT токен
     * @returns {Promise<Object>} Payload токена
     */
    async validateTokenExternal(token) {
        try {
            // 1. Криптографічна перевірка (через jose)
            // Якщо використовується HS256, TokenService.verifyToken зробить це через secret
            const payload = await this.tokenService.verifyToken(token)

            // 2. Перевірка в базі Oracle (чи не був токен відкликаний/logout)
            const session = await this.authRepository.findSessionByToken(token)

            if (!session) {
                throw new Error('Сесія була анульована або не існує в системі')
            }

            // Визначаємо, який саме токен прийшов (для зручності клієнта)
            const tokenType =
                token === session[AuthSchema.columns.token.name] ? 'access' : 'refresh'

            // 3. Повертаємо дані про токен
            return {
                valid: true,
                type: tokenType,
                user: {
                    id: payload.sub,
                    username: payload.username,
                    roles: payload.roles,
                },
                expiresAt: new Date(payload.exp * 1000),
            }
        } catch (error) {
            // Замість викидання помилки повертаємо статус невалідності
            return {
                valid: false,
                error: error.message,
            }
        }
    }
}

export default AuthService
