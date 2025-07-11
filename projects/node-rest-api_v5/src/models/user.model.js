// src/models/User.js
import oracleDbManager from '../db/OracleDbManager.js'
import logger from '../utils/logger.js'
import { hashPassword, comparePasswords } from '../utils/passwordUtils.js'

class UserModel {
    /**
     * Створює нового користувача.
     * Автоматично хешує пароль.
     * @param {object} userData - Об'єкт з даними користувача.
     * @param {string} userData.username
     * @param {string} userData.email
     * @param {string} userData.passwordHash
     * @param {string} userData.salt
     * @param {string} [userData.firstName=null]
     * @param {string} [userData.lastName=null]
     * @param {string} [userData.verificationCode=null]
     * @param {Date} [userData.verificationExpiration=null]
     * @param {boolean} [userData.isEmailVerified=false]
     * @returns {Promise<object>} Об'єкт створеного користувача.
     * @throws {Error} Якщо виникає помилка при створенні (наприклад, дублікат username/email).
     */
    async create(dbName, userData) {
        try {
            // Хешуємо пароль перед збереженням у БД
            const hashedPassword = await hashPassword(userData.password)

            const sql = `
                INSERT INTO USERS (
                    USERNAME, EMAIL, PASSWORD_HASH, SALT, FIRST_NAME, LAST_NAME,
                    VERIFICATION_CODE, VERIFICATION_EXPIRATION, IS_EMAIL_VERIFIED
                ) VALUES (
                    :username, :email, :passwordHash, :salt, :firstName, :lastName,
                    :verificationCode, :verificationExpiration, :isEmailVerified
                ) RETURNING USER_ID, USERNAME, EMAIL, IS_ACTIVE, IS_EMAIL_VERIFIED, CREATED_AT, UPDATED_AT INTO
                    :out_userId, :out_username, :out_email, :out_isActive, :out_isEmailVerified, :out_createdAt, :out_updatedAt
            `

            const binds = {
                username: userData.username,
                email: userData.email,
                passwordHash: hashedPassword, //userData.passwordHash,
                salt: userData.salt || null,
                firstName: userData.firstName || null,
                lastName: userData.lastName || null,
                verificationCode: userData.verificationCode || null,
                verificationExpiration: userData.verificationExpiration || null,
                // Явно передаємо 0 або 1, якщо isEmailVerified не передано, буде false (0)
                isEmailVerified:
                    userData.isEmailVerified !== undefined ? (userData.isEmailVerified ? 1 : 0) : 0,
                // Вихідні параметри для RETURNING INTO
                out_userId: {
                    type: oracleDbManager.oracledb.NUMBER,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_username: {
                    type: oracleDbManager.oracledb.STRING,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_email: {
                    type: oracleDbManager.oracledb.STRING,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_isActive: {
                    type: oracleDbManager.oracledb.NUMBER,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_isEmailVerified: {
                    type: oracleDbManager.oracledb.NUMBER,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_createdAt: {
                    type: oracleDbManager.oracledb.DATE,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_updatedAt: {
                    type: oracleDbManager.oracledb.DATE,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
            }
            const options = {
                autoCommit: true,
                // Bind definition для RETURNING INTO, щоб oracledb знав розміри
                bindDefs: {
                    username: { type: oracleDbManager.oracledb.STRING, maxSize: 50 },
                    email: { type: oracleDbManager.oracledb.STRING, maxSize: 100 },
                    passwordHash: { type: oracleDbManager.oracledb.STRING, maxSize: 255 },
                    salt: { type: oracleDbManager.oracledb.STRING, maxSize: 255 },
                    firstName: { type: oracleDbManager.oracledb.STRING, maxSize: 50 },
                    lastName: { type: oracleDbManager.oracledb.STRING, maxSize: 50 },
                    verificationCode: { type: oracleDbManager.oracledb.STRING, maxSize: 64 },
                    verificationExpiration: { type: oracleDbManager.oracledb.DATE },
                    isEmailVerified: { type: oracleDbManager.oracledb.NUMBER },
                },
            }

            const result = await oracleDbManager.execute(dbName, sql, binds, options)
            const outBinds = result.outBinds

            return {
                userId: outBinds.out_userId[0],
                username: outBinds.out_username[0],
                email: outBinds.out_email[0],
                isActive: outBinds.out_isActive[0] === 1,
                isEmailVerified: outBinds.out_isEmailVerified[0] === 1,
                createdAt: outBinds.out_createdAt[0],
                updatedAt: outBinds.out_updatedAt[0],
            }
        } catch (error) {
            logger.error(`Error creating user: ${error.message}`, { error })
            if (error.oracleErrorNum === 1) {
                // ORA-00001: unique constraint violated
                if (error.message.includes('USERS_USERNAME_UK')) {
                    throw new Error('Username already exists.')
                }
                if (error.message.includes('USERS_EMAIL_UK')) {
                    throw new Error('Email already registered.')
                }
            }
            throw error
        }
    }

    /**
     * Отримує користувача за ID. Включає ролі.
     * @param {number} userId - ID користувача.
     * @param {boolean} [includeDeleted=false] - Чи включати м'яко видалених користувачів.
     * @returns {Promise<object|null>} Об'єкт користувача або null.
     */
    async findById(dbName, userId, includeDeleted = false) {
        try {
            const sql = `
                SELECT
                    U.USER_ID, U.USERNAME, U.EMAIL, U.PASSWORD_HASH, U.SALT, U.FIRST_NAME, U.LAST_NAME,
                    U.IS_ACTIVE, U.IS_EMAIL_VERIFIED, U.CREATED_AT, U.UPDATED_AT, U.DELETED_AT, U.LAST_LOGIN_AT,
                    U.TWO_FACTOR_SECRET, U.VERIFICATION_CODE, U.VERIFICATION_EXPIRATION,
                    U.PASSWORD_RESET_TOKEN, U.PASSWORD_RESET_EXPIRATION,
                    LISTAGG(R.ROLE_NAME, ',') WITHIN GROUP (ORDER BY R.ROLE_NAME) AS ROLES
                FROM
                    USERS U
                LEFT JOIN
                    USER_ROLES UR ON U.USER_ID = UR.USER_ID AND UR.IS_ACTIVE = 1
                LEFT JOIN
                    ROLES R ON UR.ROLE_ID = R.ROLE_ID
                WHERE
                    U.USER_ID = :userId
                    ${includeDeleted ? '' : 'AND U.DELETED_AT IS NULL'}
                GROUP BY
                    U.USER_ID, U.USERNAME, U.EMAIL, U.PASSWORD_HASH, U.SALT, U.FIRST_NAME, U.LAST_NAME,
                    U.IS_ACTIVE, U.IS_EMAIL_VERIFIED, U.CREATED_AT, U.UPDATED_AT, U.DELETED_AT, U.LAST_LOGIN_AT,
                    U.TWO_FACTOR_SECRET, U.VERIFICATION_CODE, U.VERIFICATION_EXPIRATION,
                    U.PASSWORD_RESET_TOKEN, U.PASSWORD_RESET_EXPIRATION
            `

            const binds = { userId }
            const result = await oracleDbManager.execute(dbName, sql, binds)

            if (result.rows.length === 0) {
                return null
            }

            const user = result.rows[0]

            // Перетворюємо рядок ролей на масив
            if (user.ROLES) {
                user.ROLES = user.ROLES.split(',')
            } else {
                user.ROLES = []
            }

            // Перетворюємо числові булеві значення на справжні булеві
            user.IS_ACTIVE = user.IS_ACTIVE === 1
            user.IS_EMAIL_VERIFIED = user.IS_EMAIL_VERIFIED === 1

            return user
        } catch (error) {
            logger.error(`Error finding user by ID ${userId}: ${error.message}`, { error })
            throw error
        }
    }

    /**
     * Отримує користувача за іменем користувача (username). Включає ролі.
     * Повертає також хеш пароля для перевірки.
     * @param {string} username - Ім'я користувача.
     * @param {boolean} [includeDeleted=false] - Чи включати м'яко видалених користувачів.
     * @returns {Promise<object|null>} Об'єкт користувача або null.
     */
    async findByUsername(dbName, username, includeDeleted = false) {
        try {
            const sql = `
                SELECT
                    U.USER_ID, U.USERNAME, U.EMAIL, U.PASSWORD_HASH, U.SALT, U.FIRST_NAME, U.LAST_NAME,
                    U.IS_ACTIVE, U.IS_EMAIL_VERIFIED, U.CREATED_AT, U.UPDATED_AT, U.DELETED_AT, U.LAST_LOGIN_AT,
                    U.TWO_FACTOR_SECRET, U.VERIFICATION_CODE, U.VERIFICATION_EXPIRATION,
                    U.PASSWORD_RESET_TOKEN, U.PASSWORD_RESET_EXPIRATION,
                    LISTAGG(R.ROLE_NAME, ',') WITHIN GROUP (ORDER BY R.ROLE_NAME) AS ROLES
                FROM
                    USERS U
                LEFT JOIN
                    USER_ROLES UR ON U.USER_ID = UR.USER_ID AND UR.IS_ACTIVE = 1
                LEFT JOIN
                    ROLES R ON UR.ROLE_ID = R.ROLE_ID
                WHERE
                    U.USERNAME = :username
                    ${includeDeleted ? '' : 'AND U.DELETED_AT IS NULL'}
                GROUP BY
                    U.USER_ID, U.USERNAME, U.EMAIL, U.PASSWORD_HASH, U.SALT, U.FIRST_NAME, U.LAST_NAME,
                    U.IS_ACTIVE, U.IS_EMAIL_VERIFIED, U.CREATED_AT, U.UPDATED_AT, U.DELETED_AT, U.LAST_LOGIN_AT,
                    U.TWO_FACTOR_SECRET, U.VERIFICATION_CODE, U.VERIFICATION_EXPIRATION,
                    U.PASSWORD_RESET_TOKEN, U.PASSWORD_RESET_EXPIRATION
            `

            const binds = { username }
            const result = await oracleDbManager.execute(dbName, sql, binds)

            if (result.rows.length === 0) {
                return null
            }

            const user = result.rows[0]

            if (user.ROLES) {
                user.ROLES = user.ROLES.split(',')
            } else {
                user.ROLES = []
            }

            user.IS_ACTIVE = user.IS_ACTIVE === 1
            user.IS_EMAIL_VERIFIED = user.IS_EMAIL_VERIFIED === 1

            return user
        } catch (error) {
            logger.error(`Error finding user by username '${username}': ${error.message}`, {
                error,
            })
            throw error
        }
    }

    /**
     * Отримує користувача за Email. Включає ролі.
     * @param {string} email - Електронна пошта користувача.
     * @param {boolean} [includeDeleted=false] - Чи включати м'яко видалених користувачів.
     * @returns {Promise<object|null>} Об'єкт користувача або null.
     */
    async findByEmail(dbName, email, includeDeleted = false) {
        try {
            const sql = `
                SELECT
                    U.USER_ID, U.USERNAME, U.EMAIL, U.PASSWORD_HASH, U.SALT, U.FIRST_NAME, U.LAST_NAME,
                    U.IS_ACTIVE, U.IS_EMAIL_VERIFIED, U.CREATED_AT, U.UPDATED_AT, U.DELETED_AT, U.LAST_LOGIN_AT,
                    U.TWO_FACTOR_SECRET, U.VERIFICATION_CODE, U.VERIFICATION_EXPIRATION,
                    U.PASSWORD_RESET_TOKEN, U.PASSWORD_RESET_EXPIRATION,
                    LISTAGG(R.ROLE_NAME, ',') WITHIN GROUP (ORDER BY R.ROLE_NAME) AS ROLES
                FROM
                    USERS U
                LEFT JOIN
                    USER_ROLES UR ON U.USER_ID = UR.USER_ID AND UR.IS_ACTIVE = 1
                LEFT JOIN
                    ROLES R ON UR.ROLE_ID = R.ROLE_ID
                WHERE
                    U.EMAIL = :email
                    ${includeDeleted ? '' : 'AND U.DELETED_AT IS NULL'}
                GROUP BY
                    U.USER_ID, U.USERNAME, U.EMAIL, U.PASSWORD_HASH, U.SALT, U.FIRST_NAME, U.LAST_NAME,
                    U.IS_ACTIVE, U.IS_EMAIL_VERIFIED, U.CREATED_AT, U.UPDATED_AT, U.DELETED_AT, U.LAST_LOGIN_AT,
                    U.TWO_FACTOR_SECRET, U.VERIFICATION_CODE, U.VERIFICATION_EXPIRATION,
                    U.PASSWORD_RESET_TOKEN, U.PASSWORD_RESET_EXPIRATION
            `

            const binds = { email }
            const result = await oracleDbManager.execute(dbName, sql, binds)

            if (result.rows.length === 0) {
                return null
            }

            const user = result.rows[0]

            if (user.ROLES) {
                user.ROLES = user.ROLES.split(',')
            } else {
                user.ROLES = []
            }

            user.IS_ACTIVE = user.IS_ACTIVE === 1
            user.IS_EMAIL_VERIFIED = user.IS_EMAIL_VERIFIED === 1

            return user
        } catch (error) {
            logger.error(`Error finding user by email '${email}': ${error.message}`, {
                error,
            })
            throw error
        }
    }

    /**
     * Оновлює дані користувача.
     * Якщо передається `password`, він буде хешований.
     * @param {number} userId - ID користувача.
     * @param {object} updates - Об'єкт з полями для оновлення.
     * @returns {Promise<boolean>} True, якщо оновлено, false, якщо ні.
     * @throws {Error} Якщо виникає помилка при оновленні.
     */
    async update(dbName, userId, updates) {
        try {
            const setClauses = []
            const binds = { userId }

            // Автоматичне оновлення UPDATED_AT
            setClauses.push('UPDATED_AT = SYSTIMESTAMP')

            for (const key in updates) {
                if (updates.hasOwnProperty(key)) {
                    // Захист від оновлення ключових полів, які не повинні змінюватись напряму
                    if (
                        ['USER_ID', 'CREATED_AT', 'DELETED_AT', 'UPDATED_AT'].includes(
                            key.toUpperCase(),
                        )
                    ) {
                        logger.warn(
                            `Attempted to update restricted field: ${key.toUpperCase()} for user ${userId}`,
                        )
                        continue
                    }

                    if (key === 'password') {
                        // Якщо оновлюємо пароль, хешуємо його
                        const hashedPassword = await hashPassword(updates.password)
                        setClauses.push(`PASSWORD_HASH = :passwordHash`)
                        binds.passwordHash = hashedPassword
                        // SALT
                        setClauses.push(`SALT = :salt`)
                        binds.salt = updates[SALT] || null
                    } else if (typeof updates[key] === 'boolean') {
                        setClauses.push(`${key.toUpperCase()} = :${key}`)
                        binds[key] = updates[key] ? 1 : 0
                    } else if (updates[key] instanceof Date) {
                        setClauses.push(`${key.toUpperCase()} = :${key}`)
                        binds[key] = updates[key] // Передаємо Date об'єкт
                    } else {
                        setClauses.push(`${key.toUpperCase()} = :${key}`)
                        binds[key] = updates[key]
                    }
                }
            }

            if (setClauses.length === 0) {
                logger.warn(`No updatable fields provided for user ${userId}`)
                return false // Нічого оновлювати
            }

            const sql = `
                UPDATE USERS
                SET ${setClauses.join(', ')}
                WHERE USER_ID = :userId
            `

            const result = await oracleDbManager.execute(dbName, sql, binds, { autoCommit: true })

            return result.rowsAffected === 1
        } catch (error) {
            logger.error(`Error updating user ${userId}: ${error.message}`, {
                error,
                updates,
            })
            if (error.oracleErrorNum === 1) {
                // Унікальні обмеження
                if (error.message.includes('USERS_USERNAME_UK')) {
                    throw new Error('Username already exists.')
                }
                if (error.message.includes('USERS_EMAIL_UK')) {
                    throw new Error('Email already registered.')
                }
            }
            throw error
        }
    }

    /**
     * М'яке видалення користувача (встановлює DELETED_AT).
     * Також встановлює IS_ACTIVE = 0.
     * @param {number} userId - ID користувача.
     * @returns {Promise<boolean>} True, якщо видалено, false, якщо ні.
     * @throws {Error} Якщо виникає помилка при м'якому видаленні.
     */
    async softDelete(dbName, userId) {
        try {
            const sql = `
                UPDATE USERS
                SET DELETED_AT = SYSTIMESTAMP, IS_ACTIVE = 0, UPDATED_AT = SYSTIMESTAMP
                WHERE USER_ID = :userId AND DELETED_AT IS NULL
            ` // Перевірка DELETED_AT IS NULL, щоб не оновлювати вже видалених

            const binds = { userId }
            const result = await oracleDbManager.execute(dbName, sql, binds, { autoCommit: true })

            if (result.rowsAffected === 1) {
                logger.info(`User ${userId} soft-deleted successfully.`)
            } else {
                logger.warn(`User ${userId} not soft-deleted (already deleted or not found).`)
            }

            return result.rowsAffected === 1
        } catch (error) {
            logger.error(`Error soft-deleting user ${userId}: ${error.message}`, { error })
            throw error
        }
    }

    /**
     * Відновлення м'яко видаленого користувача (встановлює DELETED_AT в NULL).
     * Також встановлює IS_ACTIVE = 1.
     * @param {number} userId - ID користувача.
     * @returns {Promise<boolean>} True, якщо відновлено, false, якщо ні.
     * @throws {Error} Якщо виникає помилка при відновленні.
     */
    async restore(dbName, userId) {
        try {
            const sql = `
                UPDATE USERS
                SET DELETED_AT = NULL, IS_ACTIVE = 1, UPDATED_AT = SYSTIMESTAMP
                WHERE USER_ID = :userId AND DELETED_AT IS NOT NULL
            `

            const binds = { userId }
            const result = await oracleDbManager.execute(dbName, sql, binds, { autoCommit: true })

            if (result.rowsAffected === 1) {
                logger.info(`User ${userId} restored successfully.`)
            } else {
                logger.warn(`User ${userId} not restored (not soft-deleted or not found).`)
            }

            return result.rowsAffected === 1
        } catch (error) {
            logger.error(`Error restoring user ${userId}: ${error.message}`, { error })
            throw error
        }
    }

    /**
     * Пошук користувача за верифікаційним кодом.
     * @param {string} code - Верифікаційний код.
     * @returns {Promise<object|null>} Об'єкт користувача або null.
     * @throws {Error} Якщо виникає помилка при пошуку.
     */
    async findByVerificationCode(dbName, code) {
        try {
            const sql = `
                SELECT
                    USER_ID, USERNAME, EMAIL, IS_ACTIVE, IS_EMAIL_VERIFIED,
                    VERIFICATION_CODE, VERIFICATION_EXPIRATION
                FROM
                    USERS
                WHERE
                    VERIFICATION_CODE = :code AND DELETED_AT IS NULL
            `

            const binds = { code }
            const result = await oracleDbManager.execute(dbName, sql, binds)

            if (result.rows.length === 0) {
                return null
            }

            const user = result.rows[0]
            user.IS_ACTIVE = user.IS_ACTIVE === 1
            user.IS_EMAIL_VERIFIED = user.IS_EMAIL_VERIFIED === 1

            return user
        } catch (error) {
            logger.error(`Error finding user by verification code: ${error.message}`, {
                error,
            })
            throw error
        }
    }

    /**
     * Оновлює статус верифікації email та видаляє код верифікації.
     * @param {string} verificationCode - Код верифікації.
     * @returns {Promise<object|null>} Об'єкт користувача, якщо верифікація успішна, інакше null.
     */
    async verifyEmail(dbName, verificationCode) {
        try {
            const sql = `
                UPDATE USERS
                SET IS_EMAIL_VERIFIED = 1,
                    VERIFICATION_CODE = NULL,
                    VERIFICATION_EXPIRATION = NULL,
                    UPDATED_AT = SYSTIMESTAMP
                WHERE VERIFICATION_CODE = :verificationCode
                  AND VERIFICATION_EXPIRATION > SYSTIMESTAMP
                RETURNING USER_ID, USERNAME, EMAIL, IS_EMAIL_VERIFIED INTO
                    :out_userId, :out_username, :out_email, :out_isEmailVerified
            `

            const binds = {
                verificationCode: verificationCode,
                out_userId: {
                    type: oracleDbManager.oracledb.NUMBER,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_username: {
                    type: oracleDbManager.oracledb.STRING,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_email: {
                    type: oracleDbManager.oracledb.STRING,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_isEmailVerified: {
                    type: oracleDbManager.oracledb.NUMBER,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
            }

            const options = {
                autoCommit: true,
                bindDefs: { verificationCode: { type: oracleDbManager.oracledb.STRING } },
            }

            const result = await oracleDbManager.execute(dbName, sql, binds, options)

            if (result.rowsAffected === 1) {
                logger.info(`Email verified for user ${result.outBinds.out_userId[0]}`)

                return {
                    userId: result.outBinds.out_userId[0],
                    username: result.outBinds.out_username[0],
                    email: result.outBinds.out_email[0],
                    isEmailVerified: result.outBinds.out_isEmailVerified[0] === 1,
                }
            }

            logger.warn(
                `Email verification failed for code ${verificationCode}: code not found or expired.`,
            )

            return null
        } catch (error) {
            logger.error(`Error verifying email: ${error.message}`, { error })
            throw error
        }
    }

    /**
     * Зберігає токен скидання пароля та його термін дії для користувача.
     * @param {number} userId - ID користувача.
     * @param {string} token - Токен скидання пароля.
     * @param {Date} expirationDate - Дата закінчення дії токена.
     * @returns {Promise<boolean>} True, якщо токен збережено.
     */
    async savePasswordResetToken(dbName, userId, token, expirationDate) {
        try {
            const sql = `
                UPDATE USERS
                SET PASSWORD_RESET_TOKEN = :token,
                    PASSWORD_RESET_EXPIRATION = :expirationDate,
                    UPDATED_AT = SYSTIMESTAMP
                WHERE USER_ID = :userId
            `

            const binds = {
                userId: userId,
                token: token,
                expirationDate: expirationDate,
            }

            const result = await oracleDbManager.execute(dbName, sql, binds, { autoCommit: true })

            if (result.rowsAffected === 1) {
                logger.info(`Password reset token saved for user ${userId}.`)

                return true
            }

            logger.warn(`Failed to save password reset token for user ${userId}: user not found.`)

            return false
        } catch (error) {
            logger.error(`Error saving password reset token for user ${userId}: ${error.message}`, {
                error,
            })
            throw error
        }
    }

    /**
     * Пошук користувача за токеном скидання пароля.
     * @param {string} token - Токен скидання пароля.
     * @returns {Promise<object|null>} Об'єкт користувача або null.
     * @throws {Error} Якщо виникає помилка при пошуку.
     */
    async findByPasswordResetToken(dbName, token) {
        try {
            const sql = `
                SELECT
                    USER_ID, USERNAME, EMAIL, IS_ACTIVE, IS_EMAIL_VERIFIED,
                    PASSWORD_RESET_TOKEN, PASSWORD_RESET_EXPIRATION
                FROM
                    USERS
                WHERE
                    PASSWORD_RESET_TOKEN = :token AND DELETED_AT IS NULL
            `

            const binds = { token }

            const result = await oracleDbManager.execute(dbName, sql, binds)

            if (result.rows.length === 0) {
                return null
            }

            const user = result.rows[0]
            user.IS_ACTIVE = user.IS_ACTIVE === 1
            user.IS_EMAIL_VERIFIED = user.IS_EMAIL_VERIFIED === 1

            return user
        } catch (error) {
            logger.error(`Error finding user by password reset token: ${error.message}`, {
                error,
            })
            throw error
        }
    }

    /**
     * Оновлює пароль користувача та очищає токен скидання.
     * @param {number} userId - ID користувача.
     * @param {string} newPassword - Новий сирий пароль.
     * @returns {Promise<boolean>} True, якщо пароль оновлено.
     */
    async updatePassword(dbName, userId, newPassword) {
        try {
            const hashedPassword = await hashPassword(newPassword)

            const sql = `
                UPDATE USERS
                SET PASSWORD_HASH = :hashedPassword,
                    PASSWORD_RESET_TOKEN = NULL,
                    PASSWORD_RESET_EXPIRATION = NULL,
                    UPDATED_AT = SYSTIMESTAMP
                WHERE USER_ID = :userId
            `

            const binds = {
                userId: userId,
                hashedPassword: hashedPassword,
            }

            const result = await oracleDbManager.execute(dbName, sql, binds, { autoCommit: true })

            if (result.rowsAffected === 1) {
                logger.info(`Password updated for user ${userId}.`)

                return true
            }

            logger.warn(`Failed to update password for user ${userId}: user not found.`)

            return false
        } catch (error) {
            logger.error(`Error updating password for user ${userId}: ${error.message}`, {
                error,
            })
            throw error
        }
    }

    /**
     * Отримує список усіх користувачів.
     * @param {object} [filters={}] - Об'єкт фільтрів (наприклад, { isActive: true, role: 'admin' }).
     * @param {boolean} [includeDeleted=false] - Чи включати м'яко видалених користувачів.
     * @param {number} [limit] - Максимальна кількість результатів.
     * @param {number} [offset=0] - Зміщення для пагінації.
     * @returns {Promise<Array<object>>} Масив об'єктів користувачів.
     * @throws {Error} Якщо виникає помилка при отриманні списку.
     */
    async getAll(dbName, filters = {}, includeDeleted = false, limit, offset = 0) {
        try {
            let sql = `
                SELECT
                    U.USER_ID, U.USERNAME, U.EMAIL, U.FIRST_NAME, U.LAST_NAME,
                    U.IS_ACTIVE, U.IS_EMAIL_VERIFIED, U.CREATED_AT, U.UPDATED_AT, U.DELETED_AT, U.LAST_LOGIN_AT,
                    LISTAGG(R.ROLE_NAME, ',') WITHIN GROUP (ORDER BY R.ROLE_NAME) AS ROLES
                FROM
                    USERS U
                LEFT JOIN
                    USER_ROLES UR ON U.USER_ID = UR.USER_ID AND UR.IS_ACTIVE = 1
                LEFT JOIN
                    ROLES R ON UR.ROLE_ID = R.ROLE_ID
                WHERE 1=1
            `

            const binds = {}

            if (!includeDeleted) {
                sql += ' AND U.DELETED_AT IS NULL'
            }

            if (filters.isActive !== undefined) {
                sql += ' AND U.IS_ACTIVE = :isActive'
                binds.isActive = filters.isActive ? 1 : 0
            }

            if (filters.isEmailVerified !== undefined) {
                sql += ' AND U.IS_EMAIL_VERIFIED = :isEmailVerified'

                binds.isEmailVerified = filters.isEmailVerified ? 1 : 0
            }

            if (filters.username) {
                sql += ' AND U.USERNAME LIKE :username'
                binds.username = `%${filters.username}%`
            }

            if (filters.email) {
                sql += ' AND U.EMAIL LIKE :email'
                binds.email = `%${filters.email}%`
            }

            if (filters.role) {
                // Додаємо підзапит для фільтрації за роллю
                sql += ` AND EXISTS (
                    SELECT 1 FROM USER_ROLES ur_sub
                    JOIN ROLES r_sub ON ur_sub.ROLE_ID = r_sub.ROLE_ID
                    WHERE ur_sub.USER_ID = U.USER_ID AND r_sub.ROLE_NAME = :role AND ur_sub.IS_ACTIVE = 1
                )`
                binds.role = filters.role
            }

            sql += `
                GROUP BY
                    U.USER_ID, U.USERNAME, U.EMAIL, U.FIRST_NAME, U.LAST_NAME,
                    U.IS_ACTIVE, U.IS_EMAIL_VERIFIED, U.CREATED_AT, U.UPDATED_AT, U.DELETED_AT, U.LAST_LOGIN_AT
                ORDER BY U.USER_ID
            `

            if (limit) {
                sql += ` OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`
            }

            const result = await oracleDbManager.execute(dbName, sql, binds)

            return result.rows.map((user) => {
                if (user.ROLES) {
                    user.ROLES = user.ROLES.split(',')
                } else {
                    user.ROLES = []
                }

                // Перетворюємо числові булеві значення на справжні булеві
                user.IS_ACTIVE = user.IS_ACTIVE === 1
                user.IS_EMAIL_VERIFIED = user.IS_EMAIL_VERIFIED === 1

                return user
            })
        } catch (error) {
            logger.error(`Error getting all users: ${error.message}`, {
                error,
                filters,
                limit,
                offset,
            })
            throw error
        }
    }
}

export default new UserModel()
