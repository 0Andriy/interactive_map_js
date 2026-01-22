export class AuthRepository {
    constructor(dbManager) {
        this.dbManager = dbManager
    }

    async saveToken(dbAlias, { userId, token, expiresAt }) {
        const db = this.dbManager.db(dbAlias)
        const sql = `
            INSERT INTO user_sessions (user_id, token, expires_at)
            VALUES (:userId, :token, :expiresAt)
        `
        await db.execute(sql, { userId, token, expiresAt })
    }

    async findToken(dbAlias, token) {
        const db = this.dbManager.db(dbAlias)
        const sql = `SELECT * FROM user_sessions WHERE token = :token AND expires_at > CURRENT_TIMESTAMP`
        const result = await db.execute(sql, { token })
        return result.rows?.[0] || null
    }

    async deleteToken(dbAlias, token) {
        const db = this.dbManager.db(dbAlias)
        const sql = `DELETE FROM user_sessions WHERE token = :token`
        await db.execute(sql, { token })
    }
}
