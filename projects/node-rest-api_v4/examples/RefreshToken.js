// src/models/RefreshToken.js
import oracledb from 'oracledb'
import { getConnection } from '../config/database.js'
import logger from '../utils/logger.js'

export const RefreshToken = {
    async createTable() {
        let connection
        try {
            connection = await getConnection()
            const createTableSql = `
                CREATE TABLE refresh_tokens (
                    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
                    user_id RAW(16) NOT NULL,
                    token VARCHAR2(500) UNIQUE NOT NULL,
                    expires_at TIMESTAMP WITH LOCAL TIME ZONE NOT NULL,
                    created_at TIMESTAMP WITH LOCAL TIME ZONE DEFAULT SYSTIMESTAMP,
                    CONSTRAINT fk_refresh_token_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                )
            `
            await connection.execute(createTableSql)
            logger.info('Table "refresh_tokens" created successfully or already exists.')
            await connection.commit()
        } catch (err) {
            if (err.errorNum === 955) {
                logger.warn('Table "refresh_tokens" already exists, skipping creation.')
            } else {
                logger.error('Error creating refresh_tokens table:', err.message)
                throw err
            }
        } finally {
            if (connection) {
                try {
                    await connection.close()
                } catch (err) {
                    logger.error(
                        'Error closing connection after refresh_tokens table creation:',
                        err.message,
                    )
                }
            }
        }
    },

    async create(userId, token, expiresInMs) {
        let connection
        try {
            connection = await getConnection()
            const expiresAt = new Date(Date.now() + expiresInMs)

            const result = await connection.execute(
                `INSERT INTO refresh_tokens (id, user_id, token, expires_at)
                 VALUES (SYS_GUID(), :userIdRaw, :token, :expiresAt)
                 RETURNING id INTO :id_out`,
                {
                    userIdRaw: Buffer.from(userId, 'hex'), // Перетворюємо HEX-рядок ID назад у RAW
                    token: token,
                    expiresAt: expiresAt,
                    id_out: { type: oracledb.BUFFER, dir: oracledb.BIND_OUT, maxSize: 16 },
                },
                { autoCommit: true },
            )
            const newIdBuffer = result.outBinds.id_out[0]
            const newId = newIdBuffer ? newIdBuffer.toString('hex') : null
            return { id: newId, userId, token, expiresAt }
        } catch (err) {
            logger.error('Error creating refresh token:', err.message)
            throw err
        } finally {
            if (connection) {
                try {
                    await connection.close()
                } catch (err) {
                    logger.error('Error closing connection:', err.message)
                }
            }
        }
    },

    async findByToken(token) {
        let connection
        try {
            connection = await getConnection()
            const result = await connection.execute(
                `SELECT id, user_id, token, expires_at FROM refresh_tokens WHERE token = :token`,
                { token },
            )
            if (result.rows.length === 0) return null
            const refreshToken = result.rows[0]
            refreshToken.ID = refreshToken.ID.toString('hex')
            refreshToken.USER_ID = refreshToken.USER_ID.toString('hex')
            return refreshToken
        } catch (err) {
            logger.error('Error finding refresh token by token:', err.message)
            throw err
        } finally {
            if (connection) {
                try {
                    await connection.close()
                } catch (err) {
                    logger.error('Error closing connection:', err.message)
                }
            }
        }
    },

    async deleteById(id) {
        let connection
        try {
            connection = await getConnection()
            const result = await connection.execute(
                `DELETE FROM refresh_tokens WHERE id = :id`,
                { id: Buffer.from(id, 'hex') },
                { autoCommit: true },
            )
            return result.rowsAffected > 0
        } catch (err) {
            logger.error('Error deleting refresh token by ID:', err.message)
            throw err
        } finally {
            if (connection) {
                try {
                    await connection.close()
                } catch (err) {
                    logger.error('Error closing connection:', err.message)
                }
            }
        }
    },

    async deleteByUserId(userId) {
        let connection
        try {
            connection = await getConnection()
            const result = await connection.execute(
                `DELETE FROM refresh_tokens WHERE user_id = :userId`,
                { userId: Buffer.from(userId, 'hex') },
                { autoCommit: true },
            )
            return result.rowsAffected > 0
        } catch (err) {
            logger.error('Error deleting refresh tokens by user ID:', err.message)
            throw err
        } finally {
            if (connection) {
                try {
                    await connection.close()
                } catch (err) {
                    logger.error('Error closing connection:', err.message)
                }
            }
        }
    },
    // Додаткові функції для очищення прострочених токенів
    async cleanExpiredTokens() {
        let connection
        try {
            connection = await getConnection()
            const result = await connection.execute(
                `DELETE FROM refresh_tokens WHERE expires_at < SYSTIMESTAMP`,
                {},
                { autoCommit: true },
            )
            logger.info(`Cleaned up ${result.rowsAffected} expired refresh tokens.`)
            return result.rowsAffected
        } catch (err) {
            logger.error('Error cleaning expired refresh tokens:', err.message)
            throw err
        } finally {
            if (connection) {
                try {
                    await connection.close()
                } catch (err) {
                    logger.error('Error closing connection:', err.message)
                }
            }
        }
    },
}
