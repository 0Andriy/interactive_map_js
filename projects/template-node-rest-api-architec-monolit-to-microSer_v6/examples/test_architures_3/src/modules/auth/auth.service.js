export class AuthService {
    constructor(userProvider, authManager, broker) {
        this.userProvider = userProvider
        this.authManager = authManager
        this.broker = broker
    }

    async login(email, password) {
        const user = await this.userProvider.validateCredentials(email, password)
        const tokens = await this.authManager.issueTokens(user)

        // Повідомляємо систему про вхід (через брокер)
        await this.broker.publish('auth.login_success', { userId: user.id })

        return tokens
    }
}

// src/modules/auth/auth.service.js
export class AuthService {
    constructor(userClient, authRepository, eventBus) {
        this.userClient = userClient // Провайдер з іншого модуля
        this.authRepository = authRepository
        this.eventBus = eventBus
    }

    async login(userId) {
        // 1. Отримуємо дані користувача з ІНШОГО мікросервісу
        const userData = await this.userClient.getUser(userId)
        if (!userData) throw new Error('User not found in external service')

        // 2. Створюємо токен (логіка JwtService)
        const refreshToken = 'some-generated-jwt'

        // 3. Зберігаємо у ВЛАСНУ базу через репозиторій
        await this.authRepository.saveRefreshToken({
            userId: userData.id,
            refreshToken,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })

        // 4. Повідомляємо систему про подію
        this.eventBus.emit('auth.login.success', { userId: userData.id })

        return { refreshToken, user: userData }
    }
}
