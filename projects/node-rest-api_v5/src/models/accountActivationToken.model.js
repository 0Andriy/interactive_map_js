// src/models/accountActivationToken.model.js
import db from '../config/db.js'
import winston from 'winston'

const accountActivationTokenLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json(),
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/models.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
})

class AccountActivationTokenModel {
    constructor() {
        this.tableName = 'ACCOUNT_ACTIVATION_TOKENS'
    }

    /**
     * Створює нову таблицю для токенів активації облікового запису, якщо вона не існує.
     * @returns {Promise<void>}
     */
    async createTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS ${this.tableName} (
                TOKEN_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                USER_ID INTEGER NOT NULL,
                TOKEN TEXT NOT NULL UNIQUE,
                EXPIRES_AT DATETIME NOT NULL,
                IS_USED BOOLEAN NOT NULL DEFAULT 0,
                IS_REVOKED BOOLEAN NOT NULL DEFAULT 0,
                CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (USER_ID) REFERENCES USERS(USER_ID) ON DELETE CASCADE
            );
        `
        try {
            await db.execute(query)
            accountActivationTokenLogger.info(`Table '${this.tableName}' ensured to exist.`)
        } catch (error) {
            accountActivationTokenLogger.error(
                `Error creating table '${this.tableName}': ${error.message}`,
                { error },
            )
            throw error
        }
    }

    /**
     * Створює новий токен активації облікового запису в базі даних.
     * @param {object} data - Об'єкт з даними токена (userId, token, expiresAt).
     * @returns {Promise<object>} Створений об'єкт токена.
     */
    async create({ userId, token, expiresAt }) {
        const query = `
            INSERT INTO ${this.tableName} (USER_ID, TOKEN, EXPIRES_AT)
            VALUES (?, ?, ?);
        `
        const values = [userId, token, expiresAt.toISOString()]
        try {
            const result = await db.execute(query, values)
            const newToken = {
                TOKEN_ID: result.lastID,
                USER_ID: userId,
                TOKEN: token,
                EXPIRES_AT: expiresAt,
                IS_USED: false,
                IS_REVOKED: false,
                CREATED_AT: new Date(),
            }
            accountActivationTokenLogger.info(
                `Account activation token created for user ${userId}. Token ID: ${result.lastID}`,
            )
            return newToken
        } catch (error) {
            accountActivationTokenLogger.error(
                `Error creating account activation token for user ${userId}: ${error.message}`,
                { error, data },
            )
            throw error
        }
    }

    /**
     * Знаходить токен активації облікового запису за його значенням.
     * @param {string} token - Значення токена.
     * @returns {Promise<object|null>} Об'єкт токена або null, якщо не знайдено.
     */
    async findByToken(token) {
        const query = `
            SELECT TOKEN_ID, USER_ID, TOKEN, EXPIRES_AT, IS_USED, IS_REVOKED, CREATED_AT
            FROM ${this.tableName}
            WHERE TOKEN = ?;
        `
        try {
            const rows = await db.query(query, [token])
            if (rows.length === 0) {
                accountActivationTokenLogger.debug(
                    `Account activation token not found: ${token.substring(0, 10)}...`,
                )
                return null
            }
            const foundToken = rows[0]
            // Конвертуємо дати знову в об'єкти Date
            foundToken.EXPIRES_AT = new Date(foundToken.EXPIRES_AT)
            foundToken.CREATED_AT = new Date(foundToken.CREATED_AT)
            accountActivationTokenLogger.debug(
                `Account activation token found: ${token.substring(0, 10)}...`,
            )
            return foundToken
        } catch (error) {
            accountActivationTokenLogger.error(
                `Error finding account activation token by token value: ${error.message}`,
                { error, token: token.substring(0, 10) + '...' },
            )
            throw error
        }
    }

    /**
     * Позначає токен активації облікового запису як використаний.
     * @param {string} token - Значення токена.
     * @returns {Promise<boolean>} True, якщо оновлено, false, якщо ні.
     */
    async markAsUsed(token) {
        const query = `
            UPDATE ${this.tableName}
            SET IS_USED = 1
            WHERE TOKEN = ? AND IS_USED = 0 AND IS_REVOKED = 0;
        `
        try {
            const result = await db.execute(query, [token])
            if (result.changes > 0) {
                accountActivationTokenLogger.info(
                    `Account activation token marked as used: ${token.substring(0, 10)}...`,
                )
                return true
            }
            accountActivationTokenLogger.warn(
                `Account activation token not marked as used (already used/revoked or not found): ${token.substring(
                    0,
                    10,
                )}...`,
            )
            return false
        } catch (error) {
            accountActivationTokenLogger.error(
                `Error marking account activation token as used: ${error.message}`,
                { error, token: token.substring(0, 10) + '...' },
            )
            throw error
        }
    }

    /**
     * Відкликає токен активації облікового запису (робить його недійсним).
     * @param {string} token - Значення токена.
     * @returns {Promise<boolean>} True, якщо оновлено, false, якщо ні.
     */
    async revoke(token) {
        const query = `
            UPDATE ${this.tableName}
            SET IS_REVOKED = 1
            WHERE TOKEN = ? AND IS_REVOKED = 0;
        `
        try {
            const result = await db.execute(query, [token])
            if (result.changes > 0) {
                accountActivationTokenLogger.info(
                    `Account activation token revoked: ${token.substring(0, 10)}...`,
                )
                return true
            }
            accountActivationTokenLogger.warn(
                `Account activation token not revoked (already revoked or not found): ${token.substring(
                    0,
                    10,
                )}...`,
            )
            return false
        } catch (error) {
            accountActivationTokenLogger.error(
                `Error revoking account activation token: ${error.message}`,
                { error, token: token.substring(0, 10) + '...' },
            )
            throw error
        }
    }

    /**
     * Відкликає всі токени активації облікового запису для вказаного користувача.
     * @param {number} userId - ID користувача.
     * @returns {Promise<number>} Кількість відкликаних токенів.
     */
    async revokeAllForUser(userId) {
        const query = `
            UPDATE ${this.tableName}
            SET IS_REVOKED = 1
            WHERE USER_ID = ? AND IS_REVOKED = 0;
        `
        try {
            const result = await db.execute(query, [userId])
            accountActivationTokenLogger.info(
                `Revoked ${result.changes} account activation tokens for user ${userId}.`,
            )
            return result.changes
        } catch (error) {
            accountActivationTokenLogger.error(
                `Error revoking all account activation tokens for user ${userId}: ${error.message}`,
                { error },
            )
            throw error
        }
    }

    /**
     * Видаляє прострочені та/або використані/відкликані токени.
     * Запускається періодично для очищення бази даних.
     * @returns {Promise<number>} Кількість видалених токенів.
     */
    async cleanupExpiredAndUsedTokens() {
        const query = `
            DELETE FROM ${this.tableName}
            WHERE EXPIRES_AT < CURRENT_TIMESTAMP OR IS_USED = 1 OR IS_REVOKED = 1;
        `
        try {
            const result = await db.execute(query)
            accountActivationTokenLogger.info(
                `Cleaned up ${result.changes} expired/used/revoked account activation tokens.`,
            )
            return result.changes
        } catch (error) {
            accountActivationTokenLogger.error(
                `Error cleaning up expired/used account activation tokens: ${error.message}`,
                { error },
            )
            throw error
        }
    }
}

export default new AccountActivationTokenModel()
