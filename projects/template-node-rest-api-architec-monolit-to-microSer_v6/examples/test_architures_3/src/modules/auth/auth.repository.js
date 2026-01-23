// src/modules/auth/auth.repository.js
export class AuthRepository {
    constructor(dbClient) {
        this.db = dbClient // наприклад, екземпляр Prisma або Knex
    }

    async saveRefreshToken(tokenData) {
        // Логіка: INSERT INTO tokens ...
        console.log(`Token saved for user ${tokenData.userId}`)
        return tokenData
    }

    async findToken(token) {
        return this.db.tokens.findUnique({ where: { refreshToken: token } })
    }
}
