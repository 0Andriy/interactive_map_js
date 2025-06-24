// src/models/User.js
import oracledb from 'oracledb'
import { getConnection } from '../config/database.js'
import { hashPassword } from '../utils/bcrypt.js'
import logger from '../utils/logger.js'

export const User = {
    // Функція для створення таблиці (можна викликати один раз при розгортанні)
    async createTable() {
        let connection
        try {
            connection = await getConnection()
            const createTableSql = `
                CREATE TABLE users (
                    id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
                    username VARCHAR2(30) UNIQUE NOT NULL,
                    email VARCHAR2(100) UNIQUE NOT NULL,
                    password VARCHAR2(255) NOT NULL,
                    roles VARCHAR2(4000) DEFAULT '["user"]' NOT NULL, -- JSON string or comma-separated
                    created_at TIMESTAMP WITH LOCAL TIME ZONE DEFAULT SYSTIMESTAMP
                )
            `
            await connection.execute(createTableSql)
            logger.info('Table "users" created successfully or already exists.')

            // Створити індекс на email та username для швидкого пошуку
            await connection.execute(`CREATE INDEX idx_users_email ON users (email)`)
            await connection.execute(`CREATE INDEX idx_users_username ON users (username)`)

            await connection.commit()
        } catch (err) {
            // ORA-00955: name is already used by an existing object (для таблиці)
            if (err.errorNum === 955) {
                logger.warn('Table "users" already exists, skipping creation.')
            } else {
                logger.error('Error creating users table:', err.message)
                throw err
            }
        } finally {
            if (connection) {
                try {
                    await connection.close()
                } catch (err) {
                    logger.error('Error closing connection after table creation:', err.message)
                }
            }
        }
    },

    async findByEmail(email) {
        let connection
        try {
            connection = await getConnection()
            const result = await connection.execute(
                `SELECT id, username, email, password, roles FROM users WHERE email = :email`,
                { email },
            )
            if (result.rows.length === 0) return null
            const user = result.rows[0]
            // Конвертуємо RAW(16) ID в string для зручності
            user.ID = user.ID.toString('hex') // Перетворюємо буфер в HEX рядок
            user.ROLES = JSON.parse(user.ROLES) // Якщо ролі зберігаються як JSON-рядок
            return user
        } catch (err) {
            logger.error(`Error finding user by email (${email}):`, err.message)
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

    async findByUsername(username) {
        let connection
        try {
            connection = await getConnection()
            const result = await connection.execute(
                `SELECT id, username, email, password, roles FROM users WHERE username = :username`,
                { username },
            )
            if (result.rows.length === 0) return null
            const user = result.rows[0]
            user.ID = user.ID.toString('hex')
            user.ROLES = JSON.parse(user.ROLES)
            return user
        } catch (err) {
            logger.error(`Error finding user by username (${username}):`, err.message)
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

    async createUser(userData) {
        let connection
        try {
            connection = await getConnection()
            const hashedPassword = await hashPassword(userData.password)
            const rolesString = JSON.stringify(userData.roles || ['user'])

            // Oracle SYS_GUID() генерує RAW(16) UUID
            const insertSql = `
                INSERT INTO users (id, username, email, password, roles)
                VALUES (SYS_GUID(), :username, :email, :hashedPassword, :rolesString)
                RETURNING id INTO :id_out
            `
            const bindVars = {
                username: userData.username,
                email: userData.email,
                hashedPassword: hashedPassword,
                rolesString: rolesString,
                id_out: { type: oracledb.BUFFER, dir: oracledb.BIND_OUT, maxSize: 16 }, // Для RAW(16)
            }

            const result = await connection.execute(insertSql, bindVars, { autoCommit: true })
            const newIdBuffer = result.outBinds.id_out[0]
            const newId = newIdBuffer ? newIdBuffer.toString('hex') : null // Конвертуємо буфер в HEX рядок

            return {
                id: newId,
                username: userData.username,
                email: userData.email,
                roles: JSON.parse(rolesString),
            }
        } catch (err) {
            logger.error('Error creating user:', err.message)
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

    // ... інші функції, якщо потрібні (findById, update, delete)
}
