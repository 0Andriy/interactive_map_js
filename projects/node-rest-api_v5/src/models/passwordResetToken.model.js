// src/models/passwordResetToken.model.js
import db from '../config/db.js'
import winston from 'winston'

const passwordResetTokenLogger = winston.createLogger({
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

class PasswordResetTokenModel {
    constructor() {
        this.tableName = 'PASSWORD_RESET_TOKENS'
    }

    /**
     * Створює нову таблицю для токенів скидання пароля, якщо вона не існує.
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
            passwordResetTokenLogger.info(`Table '${this.tableName}' ensured to exist.`)
        } catch (error) {
            passwordResetTokenLogger.error(
                `Error creating table '${this.tableName}': ${error.message}`,
                { error },
            )
            throw error
        }
    }

    /**
     * Створює новий токен скидання пароля в базі даних.
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
            passwordResetTokenLogger.info(
                `Password reset token created for user ${userId}. Token ID: ${result.lastID}`,
            )
            return newToken
        } catch (error) {
            passwordResetTokenLogger.error(
                `Error creating password reset token for user ${userId}: ${error.message}`,
                { error, data },
            )
            throw error
        }
    }

    /**
     * Знаходить токен скидання пароля за його значенням.
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
                passwordResetTokenLogger.debug(
                    `Password reset token not found: ${token.substring(0, 10)}...`,
                )
                return null
            }
            const foundToken = rows[0]
            // Конвертуємо дати знову в об'єкти Date
            foundToken.EXPIRES_AT = new Date(foundToken.EXPIRES_AT)
            foundToken.CREATED_AT = new Date(foundToken.CREATED_AT)
            passwordResetTokenLogger.debug(
                `Password reset token found: ${token.substring(0, 10)}...`,
            )
            return foundToken
        } catch (error) {
            passwordResetTokenLogger.error(
                `Error finding password reset token by token value: ${error.message}`,
                { error, token: token.substring(0, 10) + '...' },
            )
            throw error
        }
    }

    /**
     * Позначає токен скидання пароля як використаний.
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
                passwordResetTokenLogger.info(
                    `Password reset token marked as used: ${token.substring(0, 10)}...`,
                )
                return true
            }
            passwordResetTokenLogger.warn(
                `Password reset token not marked as used (already used/revoked or not found): ${token.substring(
                    0,
                    10,
                )}...`,
            )
            return false
        } catch (error) {
            passwordResetTokenLogger.error(
                `Error marking password reset token as used: ${error.message}`,
                { error, token: token.substring(0, 10) + '...' },
            )
            throw error
        }
    }

    /**
     * Відкликає токен скидання пароля (робить його недійсним).
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
                passwordResetTokenLogger.info(
                    `Password reset token revoked: ${token.substring(0, 10)}...`,
                )
                return true
            }
            passwordResetTokenLogger.warn(
                `Password reset token not revoked (already revoked or not found): ${token.substring(
                    0,
                    10,
                )}...`,
            )
            return false
        } catch (error) {
            passwordResetTokenLogger.error(
                `Error revoking password reset token: ${error.message}`,
                { error, token: token.substring(0, 10) + '...' },
            )
            throw error
        }
    }

    /**
     * Відкликає всі токени скидання пароля для вказаного користувача.
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
            passwordResetTokenLogger.info(
                `Revoked ${result.changes} password reset tokens for user ${userId}.`,
            )
            return result.changes
        } catch (error) {
            passwordResetTokenLogger.error(
                `Error revoking all password reset tokens for user ${userId}: ${error.message}`,
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
            passwordResetTokenLogger.info(
                `Cleaned up ${result.changes} expired/used/revoked password reset tokens.`,
            )
            return result.changes
        } catch (error) {
            passwordResetTokenLogger.error(
                `Error cleaning up expired/used password reset tokens: ${error.message}`,
                { error },
            )
            throw error
        }
    }
}

export default new PasswordResetTokenModel()
