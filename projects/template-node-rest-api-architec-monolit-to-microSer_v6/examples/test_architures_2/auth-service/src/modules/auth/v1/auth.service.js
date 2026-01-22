export class AuthService {
    constructor(userClient, tokenService, db, eventBus) {
        this.userClient = userClient
        this.tokenService = tokenService
        this.db = db
        this.eventBus = eventBus
    }

    async login(email, password) {
        // 1. Отримуємо юзера з іншого сервісу
        const user = await this.userClient.findByEmail(email)
        if (!user || user.password !== password) throw new Error('401')

        // 2. Генеруємо токени
        const tokens = await this.tokenService.generatePair({ sub: user.id })

        // 3. Записуємо Refresh Token у власну базу (Oracle)
        await this.db.execute(`INSERT INTO refresh_tokens (user_id, token) VALUES (:1, :2)`, [
            user.id,
            tokens.refreshToken,
        ])

        // 4. Повідомляємо WS-сервіс через RabbitMQ
        await this.eventBus.emit('user_logged_in', { userId: user.id })

        return tokens
    }
}
