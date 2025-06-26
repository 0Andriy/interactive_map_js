// src/models/refreshToken.model.js
import oracleDbManager from '../db/OracleDbManager.js'
import logger from '../utils/logger.js'

class RefreshTokenModel {
    /**
     * Створює новий refresh-токен.
     * @param {object} tokenData - Дані токена.
     * @param {number} tokenData.userId
     * @param {string} tokenData.token - Сам токен (хешований).
     * @param {Date} tokenData.expirationDate
     * @param {string} [tokenData.ipAddress=null]
     * @param {string} [tokenData.userAgent=null]
     * @returns {Promise<object>} Об'єкт створеного токена.
     * @throws {Error} Якщо виникає помилка при створенні.
     */
    async create(dbName, tokenData) {
        try {
            const sql = `
                INSERT INTO REFRESH_TOKENS (USER_ID, TOKEN, EXPIRATION_DATE, IP_ADDRESS, USER_AGENT)
                VALUES (:userId, :token, :expirationDate, :ipAddress, :userAgent)
                RETURNING TOKEN_ID, USER_ID, TOKEN, EXPIRATION_DATE, CREATED_AT, IS_REVOKED INTO
                    :out_tokenId, :out_userId, :out_token, :out_expirationDate, :out_createdAt, :out_isRevoked
            `

            const binds = {
                userId: tokenData.userId,
                token: tokenData.token,
                expirationDate: tokenData.expirationDate, // oracledb автоматично обробляє Date об'єкти
                ipAddress: tokenData.ipAddress || null,
                userAgent: tokenData.userAgent || null,
                // Вихідні параметри
                out_tokenId: {
                    type: oracleDbManager.oracledb.NUMBER,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_userId: {
                    type: oracleDbManager.oracledb.NUMBER,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_token: {
                    type: oracleDbManager.oracledb.STRING,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_expirationDate: {
                    type: oracleDbManager.oracledb.DATE,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_createdAt: {
                    type: oracleDbManager.oracledb.DATE,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_isRevoked: {
                    type: oracleDbManager.oracledb.NUMBER,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
            }

            const options = { autoCommit: true }

            const result = await oracleDbManager.execute(dbName, sql, binds, options)
            const outBinds = result.outBinds

            logger.info(`Refresh token created for user ${tokenData.userId}.`)

            return {
                tokenId: outBinds.out_tokenId[0],
                userId: outBinds.out_userId[0],
                token: outBinds.out_token[0],
                expirationDate: outBinds.out_expirationDate[0],
                createdAt: outBinds.out_createdAt[0],
                isRevoked: outBinds.out_isRevoked[0] === 1,
            }
        } catch (error) {
            logger.error(
                `Error creating refresh token for user ${tokenData.userId}: ${error.message}`,
                { error, tokenData },
            )
            if (error.oracleErrorNum === 1 && error.message.includes('REFRESH_TOKENS_TOKEN_UK')) {
                throw new Error('Provided refresh token value already exists.')
            }
            if (error.oracleErrorNum === 2291) {
                // ORA-02291: integrity constraint violated - parent key not found
                throw new Error('User does not exist for this refresh token.')
            }
            throw error
        }
    }

    /**
     * Знаходить refresh-токен за його значенням.
     * Перевіряє, чи токен не відкликаний і не прострочений.
     * @param {string} token - Значення refresh-токена.
     * @returns {Promise<object|null>} Об'єкт токена або null.
     * @throws {Error} Якщо виникає помилка при пошуку.
     */
    async findByToken(dbName, token) {
        try {
            const sql = `
                SELECT TOKEN_ID, USER_ID, TOKEN, EXPIRATION_DATE, CREATED_AT, IP_ADDRESS, USER_AGENT, IS_REVOKED
                FROM REFRESH_TOKENS
                WHERE TOKEN = :token AND IS_REVOKED = 0 AND EXPIRATION_DATE > SYSTIMESTAMP
            `

            const binds = { token }

            const result = await oracleDbManager.execute(dbName, sql, binds)

            if (result.rows.length === 0) {
                return null
            }

            const foundToken = result.rows[0]
            foundToken.IS_REVOKED = foundToken.IS_REVOKED === 1

            return foundToken
        } catch (error) {
            logger.error(`Error finding refresh token by value: ${error.message}`, { error })
            throw error
        }
    }

    /**
     * Відкликає refresh-токен за його значенням.
     * @param {string} token - Значення refresh-токена.
     * @returns {Promise<boolean>} True, якщо відкликано, false, якщо ні.
     * @throws {Error} Якщо виникає помилка при відкликанні.
     */
    async revoke(dbName, token) {
        try {
            const sql = `
                UPDATE REFRESH_TOKENS
                SET IS_REVOKED = 1
                WHERE TOKEN = :token AND IS_REVOKED = 0
            `

            const binds = { token }

            const result = await oracleDbManager.execute(dbName, sql, binds, { autoCommit: true })

            if (result.rowsAffected === 1) {
                logger.info(`Refresh token revoked: ${token.substring(0, 10)}...`)
            } else {
                logger.warn(
                    `Refresh token not revoked (not found or already revoked): ${token.substring(
                        0,
                        10,
                    )}...`,
                )
            }

            return result.rowsAffected === 1
        } catch (error) {
            logger.error(`Error revoking refresh token: ${error.message}`, {
                error,
            })
            throw error
        }
    }

    /**
     * Відкликає всі refresh-токени для конкретного користувача.
     * Використовується при зміні пароля або виході з усіх пристроїв.
     * @param {number} userId - ID користувача.
     * @returns {Promise<number>} Кількість відкликаних токенів.
     * @throws {Error} Якщо виникає помилка при відкликанні.
     */
    async revokeAllForUser(dbName, userId) {
        try {
            const sql = `
                UPDATE REFRESH_TOKENS
                SET IS_REVOKED = 1
                WHERE USER_ID = :userId AND IS_REVOKED = 0
            `

            const binds = { userId }

            const result = await oracleDbManager.execute(dbName, sql, binds, { autoCommit: true })

            logger.info(`Revoked ${result.rowsAffected} refresh tokens for user ${userId}.`)

            return result.rowsAffected
        } catch (error) {
            logger.error(`Error revoking all refresh tokens for user ${userId}: ${error.message}`, {
                error,
            })
            throw error
        }
    }

    /**
     * Видаляє прострочені або відкликані токени з бази даних.
     * Може бути запущено за допомогою cron-джоба.
     * @returns {Promise<number>} Кількість видалених токенів.
     * @throws {Error} Якщо виникає помилка при очищенні.
     */
    async cleanupExpiredAndRevokedTokens(dbName) {
        try {
            const sql = `
                DELETE FROM REFRESH_TOKENS
                WHERE EXPIRATION_DATE < SYSTIMESTAMP OR IS_REVOKED = 1
            `

            const result = await oracleDbManager.execute(dbName, sql, {}, { autoCommit: true })

            logger.info(`Cleaned up ${result.rowsAffected} expired/revoked refresh tokens.`)

            return result.rowsAffected
        } catch (error) {
            logger.error(`Error cleaning up expired/revoked refresh tokens: ${error.message}`, {
                error,
            })
            throw error
        }
    }
}

export default new RefreshTokenModel()
