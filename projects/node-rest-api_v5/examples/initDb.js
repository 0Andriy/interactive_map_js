// src/utils/dbUtils.js
import { getConnection } from '../config/db.js'
import winston from 'winston'

const queryLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json(),
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/queries.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
})

/**
 * Виконує SQL-запит до бази даних.
 * @param {string} sql - SQL-запит.
 * @param {object | Array} binds - Об'єкт або масив параметрів для прив'язки.
 * @param {object} options - Опції виконання запиту.
 * @returns {Promise<oracledb.Result<any>>} Результат виконання запиту.
 */
export async function executeQuery(sql, binds = {}, options = {}) {
    let connection
    try {
        connection = await getConnection()
        const result = await connection.execute(sql, binds, options)
        queryLogger.info('SQL Query Executed successfully.', {
            sql: sql.substring(0, 200) + (sql.length > 200 ? '...' : ''), // Обрізаємо довгий SQL
            binds: Object.keys(binds).length > 0 ? Object.keys(binds) : 'No binds', // Показуємо тільки ключі для binds
            rowsAffected: result.rowsAffected,
            operation: sql.trim().split(' ')[0].toUpperCase(), // INSERT, UPDATE, DELETE, SELECT
        })
        return result
    } catch (err) {
        queryLogger.error('Error executing SQL query.', {
            sql: sql.substring(0, 200) + (sql.length > 200 ? '...' : ''),
            binds: Object.keys(binds).length > 0 ? Object.keys(binds) : 'No binds',
            error: err.message,
            oracleErrorNum: err.errorNum,
            stack: err.stack, // Логуємо стек-трейс для дебагу
        })
        // Перекидаємо помилку, щоб контролер або сервіс могли її обробити
        throw new Error(`Database operation failed: ${err.message}`)
    } finally {
        if (connection) {
            try {
                await connection.close()
            } catch (closeErr) {
                queryLogger.error('Error closing database connection:', { error: closeErr.message })
            }
        }
    }
}

// <================================================================================>

// src/database/initDb.js
import { executeQuery } from '../utils/dbUtils.js'
import winston from 'winston'

const initDbLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json(),
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/db_init.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
})

const createTableSQL = {
    users: `
        CREATE TABLE USERS (
            USER_ID                 NUMBER(10)      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            USERNAME                VARCHAR2(50)    NOT NULL UNIQUE,
            EMAIL                   VARCHAR2(100)   NOT NULL UNIQUE,
            PASSWORD_HASH           VARCHAR2(255)   NOT NULL,
            SALT                    VARCHAR2(255),
            FIRST_NAME              VARCHAR2(50),
            LAST_NAME               VARCHAR2(50),
            IS_ACTIVE               NUMBER(1)       DEFAULT 1 NOT NULL,
            IS_EMAIL_VERIFIED       NUMBER(1)       DEFAULT 0 NOT NULL, -- Додано
            CREATED_AT              TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
            UPDATED_AT              TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
            DELETED_AT              TIMESTAMP,
            LAST_LOGIN_AT           TIMESTAMP,
            TWO_FACTOR_SECRET       VARCHAR2(255),
            VERIFICATION_CODE       VARCHAR2(64),
            VERIFICATION_EXPIRATION TIMESTAMP,
            PASSWORD_RESET_TOKEN    VARCHAR2(64),
            PASSWORD_RESET_EXPIRATION TIMESTAMP
        )
    `,
    roles: `
        CREATE TABLE ROLES (
            ROLE_ID                 NUMBER(10)      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            ROLE_NAME               VARCHAR2(50)    NOT NULL UNIQUE,
            DESCRIPTION             VARCHAR2(255),
            CREATED_AT              TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
            UPDATED_AT              TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL
        )
    `,
    user_roles: `
        CREATE TABLE USER_ROLES (
            USER_ROLE_ID            NUMBER(10)      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            USER_ID                 NUMBER(10)      NOT NULL,
            ROLE_ID                 NUMBER(10)      NOT NULL,
            ASSIGNED_AT             TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
            IS_ACTIVE               NUMBER(1)       DEFAULT 1 NOT NULL,
            CONSTRAINT FK_USER_ROLES_USER FOREIGN KEY (USER_ID) REFERENCES USERS(USER_ID) ON DELETE CASCADE,
            CONSTRAINT FK_USER_ROLES_ROLE FOREIGN KEY (ROLE_ID) REFERENCES ROLES(ROLE_ID) ON DELETE CASCADE,
            CONSTRAINT UK_USER_ROLES UNIQUE (USER_ID, ROLE_ID)
        )
    `,
    refresh_tokens: `
        CREATE TABLE REFRESH_TOKENS (
            TOKEN_ID                NUMBER(10)      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            USER_ID                 NUMBER(10)      NOT NULL,
            TOKEN                   VARCHAR2(512)   NOT NULL UNIQUE,
            EXPIRATION_DATE         TIMESTAMP       NOT NULL,
            CREATED_AT              TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
            IP_ADDRESS              VARCHAR2(45),
            USER_AGENT              VARCHAR2(255),
            IS_REVOKED              NUMBER(1)       DEFAULT 0 NOT NULL,
            CONSTRAINT FK_REFRESH_TOKENS_USER FOREIGN KEY (USER_ID) REFERENCES USERS(USER_ID) ON DELETE CASCADE
        )
    `,
    // Індекси
    idx_users_username: `CREATE INDEX IDX_USERS_USERNAME ON USERS (USERNAME)`,
    idx_users_email: `CREATE INDEX IDX_USERS_EMAIL ON USERS (EMAIL)`,
    idx_users_deleted_at: `CREATE INDEX IDX_USERS_DELETED_AT ON USERS (DELETED_AT)`,
    idx_roles_role_name: `CREATE INDEX IDX_ROLES_ROLE_NAME ON ROLES (ROLE_NAME)`,
    idx_user_roles_user_id: `CREATE INDEX IDX_USER_ROLES_USER_ID ON USER_ROLES (USER_ID)`,
    idx_user_roles_role_id: `CREATE INDEX IDX_USER_ROLES_ROLE_ID ON USER_ROLES (ROLE_ID)`,
    idx_refresh_tokens_user_id: `CREATE INDEX IDX_REFRESH_TOKENS_USER_ID ON REFRESH_TOKENS (USER_ID)`,

    // Коментарі до таблиць
    comment_users: `COMMENT ON TABLE USERS IS 'Таблиця для зберігання інформації про користувачів системи з підтримкою м''якого видалення.'`,
    comment_col_users_user_id: `COMMENT ON COLUMN USERS.USER_ID IS 'Унікальний ідентифікатор користувача.'`,
    comment_col_users_username: `COMMENT ON COLUMN USERS.USERNAME IS 'Ім''я користувача (логін) для входу.'`,
    comment_col_users_email: `COMMENT ON COLUMN USERS.EMAIL IS 'Електронна пошта користувача, використовується для входу та відновлення пароля.'`,
    comment_col_users_password_hash: `COMMENT ON COLUMN USERS.PASSWORD_HASH IS 'Хеш пароля користувача.'`,
    comment_col_users_salt: `COMMENT ON COLUMN USERS.SALT IS 'Сіль для хешування пароля.'`,
    comment_col_users_first_name: `COMMENT ON COLUMN USERS.FIRST_NAME IS 'Ім''я користувача.'`,
    comment_col_users_last_name: `COMMENT ON COLUMN USERS.LAST_NAME IS 'Прізвище користувача.'`,
    comment_col_users_is_active: `COMMENT ON COLUMN USERS.IS_ACTIVE IS 'Статус активності облікового запису (1 - активний, 0 - неактивний).'`,
    comment_col_users_is_email_verified: `COMMENT ON COLUMN USERS.IS_EMAIL_VERIFIED IS 'Статус підтвердження електронної пошти (1 - підтверджено, 0 - не підтверджено).'`,
    comment_col_users_created_at: `COMMENT ON COLUMN USERS.CREATED_AT IS 'Дата і час створення облікового запису.'`,
    comment_col_users_updated_at: `COMMENT ON COLUMN USERS.UPDATED_AT IS 'Дата і час останнього оновлення облікового запису.'`,
    comment_col_users_deleted_at: `COMMENT ON COLUMN USERS.DELETED_AT IS 'Дата і час м''якого видалення облікового запису. NULL, якщо обліковий запис не видалено.'`,
    comment_col_users_last_login_at: `COMMENT ON COLUMN USERS.LAST_LOGIN_AT IS 'Дата і час останнього входу користувача.'`,
    comment_col_users_two_factor_secret: `COMMENT ON COLUMN USERS.TWO_FACTOR_SECRET IS 'Секрет для двофакторної аутентифікації.'`,
    comment_col_users_verification_code: `COMMENT ON COLUMN USERS.VERIFICATION_CODE IS 'Код для верифікації електронної пошти.'`,
    comment_col_users_verification_expiration: `COMMENT ON COLUMN USERS.VERIFICATION_EXPIRATION IS 'Термін дії коду верифікації.'`,
    comment_col_users_password_reset_token: `COMMENT ON COLUMN USERS.PASSWORD_RESET_TOKEN IS 'Токен для скидання пароля.'`,
    comment_col_users_password_reset_expiration: `COMMENT ON COLUMN USERS.PASSWORD_RESET_EXPIRATION IS 'Термін дії токена скидання пароля.'`,

    comment_roles: `COMMENT ON TABLE ROLES IS 'Таблиця для визначення доступних ролей в системі.'`,
    comment_col_roles_role_id: `COMMENT ON COLUMN ROLES.ROLE_ID IS 'Унікальний ідентифікатор ролі.'`,
    comment_col_roles_role_name: `COMMENT ON COLUMN ROLES.ROLE_NAME IS 'Назва ролі (наприклад, admin, editor).'`,
    comment_col_roles_description: `COMMENT ON COLUMN ROLES.DESCRIPTION IS 'Опис ролі.'`,
    comment_col_roles_created_at: `COMMENT ON COLUMN ROLES.CREATED_AT IS 'Дата і час створення ролі.'`,
    comment_col_roles_updated_at: `COMMENT ON COLUMN ROLES.UPDATED_AT IS 'Дата і час останнього оновлення ролі.'`,

    comment_user_roles: `COMMENT ON TABLE USER_ROLES IS 'Проміжна таблиця для зв''язку користувачів з ролями (багато-до-багатьох).'`,
    comment_col_user_roles_user_role_id: `COMMENT ON COLUMN USER_ROLES.USER_ROLE_ID IS 'Унікальний ідентифікатор зв''язку ролі користувача.'`,
    comment_col_user_roles_user_id: `COMMENT ON COLUMN USER_ROLES.USER_ID IS 'Ідентифікатор користувача.'`,
    comment_col_user_roles_role_id: `COMMENT ON COLUMN USER_ROLES.ROLE_ID IS 'Ідентифікатор ролі.'`,
    comment_col_user_roles_assigned_at: `COMMENT ON COLUMN USER_ROLES.ASSIGNED_AT IS 'Дата і час призначення ролі користувачеві.'`,
    comment_col_user_roles_is_active: `COMMENT ON COLUMN USER_ROLES.IS_ACTIVE IS 'Статус активності цієї конкретної ролі для користувача.'`,

    comment_refresh_tokens: `COMMENT ON TABLE REFRESH_TOKENS IS 'Таблиця для зберігання refresh-токенів користувачів.'`,
    comment_col_refresh_tokens_token_id: `COMMENT ON COLUMN REFRESH_TOKENS.TOKEN_ID IS 'Унікальний ідентифікатор refresh-токена.'`,
    comment_col_refresh_tokens_user_id: `COMMENT ON COLUMN REFRESH_TOKENS.USER_ID IS 'Ідентифікатор користувача, якому належить refresh-токен.'`,
    comment_col_refresh_tokens_token: `COMMENT ON COLUMN REFRESH_TOKENS.TOKEN IS 'Сам refresh-токен (хешований).'`,
    comment_col_refresh_tokens_expiration_date: `COMMENT ON COLUMN REFRESH_TOKENS.EXPIRATION_DATE IS 'Дата і час закінчення дії refresh-токена.'`,
    comment_col_refresh_tokens_created_at: `COMMENT ON COLUMN REFRESH_TOKENS.CREATED_AT IS 'Дата і час створення refresh-токена.'`,
    comment_col_refresh_tokens_ip_address: `COMMENT ON COLUMN REFRESH_TOKENS.IP_ADDRESS IS 'IP-адреса, з якої був виданий токен.'`,
    comment_col_refresh_tokens_user_agent: `COMMENT ON COLUMN REFRESH_TOKENS.USER_AGENT IS 'User-Agent, з якого був виданий токен.'`,
    comment_col_refresh_tokens_is_revoked: `COMMENT ON COLUMN REFRESH_TOKENS.IS_REVOKED IS 'Статус відкликання токена (1 - відкликаний, 0 - активний).'`,
}

/**
 * Створює всі необхідні таблиці в базі даних.
 */
export async function createTables() {
    initDbLogger.info('Starting database table creation...')

    const tableOrder = [
        'users',
        'roles',
        'user_roles', // Залежить від USERS та ROLES
        'refresh_tokens', // Залежить від USERS
    ]

    const indexOrder = [
        'idx_users_username',
        'idx_users_email',
        'idx_users_deleted_at',
        'idx_roles_role_name',
        'idx_user_roles_user_id',
        'idx_user_roles_role_id',
        'idx_refresh_tokens_user_id',
    ]

    const commentOrder = [
        'comment_users',
        'comment_col_users_user_id',
        'comment_col_users_username',
        'comment_col_users_email',
        'comment_col_users_password_hash',
        'comment_col_users_salt',
        'comment_col_users_first_name',
        'comment_col_users_last_name',
        'comment_col_users_is_active',
        'comment_col_users_is_email_verified',
        'comment_col_users_created_at',
        'comment_col_users_updated_at',
        'comment_col_users_deleted_at',
        'comment_col_users_last_login_at',
        'comment_col_users_two_factor_secret',
        'comment_col_users_verification_code',
        'comment_col_users_verification_expiration',
        'comment_col_users_password_reset_token',
        'comment_col_users_password_reset_expiration',

        'comment_roles',
        'comment_col_roles_role_id',
        'comment_col_roles_role_name',
        'comment_col_roles_description',
        'comment_col_roles_created_at',
        'comment_col_roles_updated_at',

        'comment_user_roles',
        'comment_col_user_roles_user_role_id',
        'comment_col_user_roles_user_id',
        'comment_col_user_roles_role_id',
        'comment_col_user_roles_assigned_at',
        'comment_col_user_roles_is_active',

        'comment_refresh_tokens',
        'comment_col_refresh_tokens_token_id',
        'comment_col_refresh_tokens_user_id',
        'comment_col_refresh_tokens_token',
        'comment_col_refresh_tokens_expiration_date',
        'comment_col_refresh_tokens_created_at',
        'comment_col_refresh_tokens_ip_address',
        'comment_col_refresh_tokens_user_agent',
        'comment_col_refresh_tokens_is_revoked',
    ]

    for (const tableName of tableOrder) {
        try {
            await executeQuery(createTableSQL[tableName])
            initDbLogger.info(`Table '${tableName.toUpperCase()}' created successfully.`)
        } catch (error) {
            if (error.oracleErrorNum === 955) {
                // ORA-00955: name is already used by an existing object
                initDbLogger.warn(
                    `Table '${tableName.toUpperCase()}' already exists. Skipping creation.`,
                )
            } else {
                initDbLogger.error(
                    `Error creating table '${tableName.toUpperCase()}': ${error.message}`,
                    { error },
                )
                throw error // Зупиняємо, якщо є критична помилка
            }
        }
    }

    for (const indexName of indexOrder) {
        try {
            await executeQuery(createTableSQL[indexName])
            initDbLogger.info(`Index '${indexName.toUpperCase()}' created successfully.`)
        } catch (error) {
            if (error.oracleErrorNum === 955) {
                initDbLogger.warn(
                    `Index '${indexName.toUpperCase()}' already exists. Skipping creation.`,
                )
            } else {
                initDbLogger.error(
                    `Error creating index '${indexName.toUpperCase()}': ${error.message}`,
                    { error },
                )
                throw error
            }
        }
    }

    for (const commentName of commentOrder) {
        try {
            await executeQuery(createTableSQL[commentName])
            initDbLogger.info(`Comment for '${commentName}' added successfully.`)
        } catch (error) {
            initDbLogger.error(`Error adding comment for '${commentName}': ${error.message}`, {
                error,
            })
            // Не зупиняємо процес через помилку коментаря, це не критично для функціоналу
        }
    }

    initDbLogger.info('Database table creation process completed.')
}

// Додайте метод для видалення таблиць (для розробки/тестування)
export async function dropTables() {
    initDbLogger.warn('Starting database table dropping...')
    const reverseTableOrder = ['REFRESH_TOKENS', 'USER_ROLES', 'ROLES', 'USERS'] // Зворотний порядок для коректного видалення з урахуванням FK

    for (const tableName of reverseTableOrder) {
        try {
            await executeQuery(`DROP TABLE ${tableName} CASCADE CONSTRAINTS`)
            initDbLogger.info(`Table '${tableName}' dropped successfully.`)
        } catch (error) {
            if (error.oracleErrorNum === 942) {
                // ORA-00942: table or view does not exist
                initDbLogger.warn(`Table '${tableName}' does not exist. Skipping drop.`)
            } else {
                initDbLogger.error(`Error dropping table '${tableName}': ${error.message}`, {
                    error,
                })
                // Не зупиняємо, спробуємо видалити інші таблиці
            }
        }
    }
    initDbLogger.warn('Database table dropping process completed.')
}

// <=================================================================================================>

// src/models/refreshToken.model.js
import { executeQuery } from '../utils/dbUtils.js'
import oracledb from 'oracledb'

class RefreshTokenModel {
    /**
     * Створює новий refresh-токен.
     * @param {object} tokenData - Дані токена.
     * @param {number} tokenData.userId
     * @param {string} tokenData.token - Сам токен (хешований).
     * @param {Date} tokenData.expirationDate
     * @param {string} [tokenData.ipAddress]
     * @param {string} [tokenData.userAgent]
     * @returns {Promise<object>} Об'єкт створеного токена.
     */
    async create(tokenData) {
        const sql = `
            INSERT INTO REFRESH_TOKENS (USER_ID, TOKEN, EXPIRATION_DATE, IP_ADDRESS, USER_AGENT)
            VALUES (:userId, :token, :expirationDate, :ipAddress, :userAgent)
            RETURNING TOKEN_ID, USER_ID, TOKEN, EXPIRATION_DATE, CREATED_AT, IS_REVOKED INTO
                :out_tokenId, :out_userId, :out_token, :out_expirationDate, :out_createdAt, :out_isRevoked
        `
        const binds = {
            userId: tokenData.userId,
            token: tokenData.token,
            expirationDate: tokenData.expirationDate,
            ipAddress: tokenData.ipAddress || null,
            userAgent: tokenData.userAgent || null,
            out_tokenId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            out_userId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            out_token: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
            out_expirationDate: { type: oracledb.DATE, dir: oracledb.BIND_OUT },
            out_createdAt: { type: oracledb.DATE, dir: oracledb.BIND_OUT },
            out_isRevoked: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
        }
        const options = { autoCommit: true }
        const result = await executeQuery(sql, binds, options)
        const outBinds = result.outBinds
        return {
            tokenId: outBinds.out_tokenId[0],
            userId: outBinds.out_userId[0],
            token: outBinds.out_token[0],
            expirationDate: outBinds.out_expirationDate[0],
            createdAt: outBinds.out_createdAt[0],
            isRevoked: outBinds.out_isRevoked[0] === 1,
        }
    }

    /**
     * Знаходить refresh-токен за його значенням.
     * @param {string} token - Значення refresh-токена.
     * @returns {Promise<object|null>} Об'єкт токена або null.
     */
    async findByToken(token) {
        const sql = `
            SELECT TOKEN_ID, USER_ID, TOKEN, EXPIRATION_DATE, CREATED_AT, IP_ADDRESS, USER_AGENT, IS_REVOKED
            FROM REFRESH_TOKENS
            WHERE TOKEN = :token AND IS_REVOKED = 0 AND EXPIRATION_DATE > SYSTIMESTAMP
        `
        const binds = { token }
        const result = await executeQuery(sql, binds)
        return result.rows.length > 0 ? result.rows[0] : null
    }

    /**
     * Відкликає refresh-токен за його значенням.
     * @param {string} token - Значення refresh-токена.
     * @returns {Promise<boolean>} True, якщо відкликано, false, якщо ні.
     */
    async revoke(token) {
        const sql = `
            UPDATE REFRESH_TOKENS
            SET IS_REVOKED = 1
            WHERE TOKEN = :token AND IS_REVOKED = 0
        `
        const binds = { token }
        const result = await executeQuery(sql, binds, { autoCommit: true })
        return result.rowsAffected === 1
    }

    /**
     * Відкликає всі refresh-токени для конкретного користувача.
     * Використовується при зміні пароля або виході з усіх пристроїв.
     * @param {number} userId - ID користувача.
     * @returns {Promise<number>} Кількість відкликаних токенів.
     */
    async revokeAllForUser(userId) {
        const sql = `
            UPDATE REFRESH_TOKENS
            SET IS_REVOKED = 1
            WHERE USER_ID = :userId AND IS_REVOKED = 0
        `
        const binds = { userId }
        const result = await executeQuery(sql, binds, { autoCommit: true })
        return result.rowsAffected
    }

    /**
     * Видаляє прострочені або відкликані токени.
     * Може бути запущено за допомогою cron-джоба.
     * @returns {Promise<number>} Кількість видалених токенів.
     */
    async cleanupExpiredAndRevokedTokens() {
        const sql = `
            DELETE FROM REFRESH_TOKENS
            WHERE EXPIRATION_DATE < SYSTIMESTAMP OR IS_REVOKED = 1
        `
        const result = await executeQuery(sql, {}, { autoCommit: true })
        return result.rowsAffected
    }
}

// export default new RefreshTokenModel()

// <=================================================================================>
// src/models/userRole.model.js
import { executeQuery } from '../utils/dbUtils.js'
import oracledb from 'oracledb'

class UserRoleModel {
    /**
     * Призначає роль користувачеві.
     * @param {number} userId - ID користувача.
     * @param {number} roleId - ID ролі.
     * @returns {Promise<object>} Об'єкт призначеної ролі.
     */
    async assignRole(userId, roleId) {
        const sql = `
            INSERT INTO USER_ROLES (USER_ID, ROLE_ID)
            VALUES (:userId, :roleId)
            RETURNING USER_ROLE_ID, USER_ID, ROLE_ID, ASSIGNED_AT INTO
                :out_userRoleId, :out_userId, :out_roleId, :out_assignedAt
        `
        const binds = {
            userId,
            roleId,
            out_userRoleId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            out_userId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            out_roleId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            out_assignedAt: { type: oracledb.DATE, dir: oracledb.BIND_OUT },
        }
        const options = { autoCommit: true }
        try {
            const result = await executeQuery(sql, binds, options)
            const outBinds = result.outBinds
            return {
                userRoleId: outBinds.out_userRoleId[0],
                userId: outBinds.out_userId[0],
                roleId: outBinds.out_roleId[0],
                assignedAt: outBinds.out_assignedAt[0],
            }
        } catch (error) {
            if (error.errorNum === 1 && error.message.includes('UK_USER_ROLES')) {
                // ORA-00001: unique constraint (YOUR_SCHEMA.UK_USER_ROLES) violated
                throw new Error('User already has this role.')
            }
            throw error
        }
    }

    /**
     * Відкликає роль у користувача (видаляє запис з USER_ROLES).
     * @param {number} userId - ID користувача.
     * @param {number} roleId - ID ролі.
     * @returns {Promise<boolean>} True, якщо відкликано, false, якщо ні.
     */
    async revokeRole(userId, roleId) {
        const sql = `
            DELETE FROM USER_ROLES
            WHERE USER_ID = :userId AND ROLE_ID = :roleId
        `
        const binds = { userId, roleId }
        const result = await executeQuery(sql, binds, { autoCommit: true })
        return result.rowsAffected === 1
    }

    /**
     * Перевіряє, чи має користувач певну роль.
     * @param {number} userId - ID користувача.
     * @param {string} roleName - Назва ролі.
     * @returns {Promise<boolean>} True, якщо має роль, false, якщо ні.
     */
    async hasRole(userId, roleName) {
        const sql = `
            SELECT COUNT(UR.USER_ROLE_ID) AS COUNT
            FROM USER_ROLES UR
            JOIN ROLES R ON UR.ROLE_ID = R.ROLE_ID
            WHERE UR.USER_ID = :userId AND R.ROLE_NAME = :roleName AND UR.IS_ACTIVE = 1
        `
        const binds = { userId, roleName }
        const result = await executeQuery(sql, binds)
        return result.rows[0].COUNT > 0
    }

    /**
     * Отримує всі ролі для конкретного користувача.
     * @param {number} userId - ID користувача.
     * @param {boolean} [includeInactive=false] - Чи включати неактивні ролі.
     * @returns {Promise<Array<object>>} Масив об'єктів ролей.
     */
    async getRolesForUser(userId, includeInactive = false) {
        const sql = `
            SELECT R.ROLE_ID, R.ROLE_NAME, R.DESCRIPTION, UR.ASSIGNED_AT, UR.IS_ACTIVE AS USER_ROLE_IS_ACTIVE
            FROM USER_ROLES UR
            JOIN ROLES R ON UR.ROLE_ID = R.ROLE_ID
            WHERE UR.USER_ID = :userId
            ${includeInactive ? '' : 'AND UR.IS_ACTIVE = 1'}
            ORDER BY R.ROLE_NAME
        `
        const binds = { userId }
        const result = await executeQuery(sql, binds)
        return result.rows.map((row) => ({
            roleId: row.ROLE_ID,
            roleName: row.ROLE_NAME,
            description: row.DESCRIPTION,
            assignedAt: row.ASSIGNED_AT,
            isActive: row.USER_ROLE_IS_ACTIVE === 1, // Конвертуємо в boolean
        }))
    }

    /**
     * Змінює активність певної ролі для користувача.
     * @param {number} userId - ID користувача.
     * @param {number} roleId - ID ролі.
     * @param {boolean} isActive - Новий статус активності.
     * @returns {Promise<boolean>} True, якщо оновлено, false, якщо ні.
     */
    async updateRoleStatusForUser(userId, roleId, isActive) {
        const sql = `
            UPDATE USER_ROLES
            SET IS_ACTIVE = :isActive, ASSIGNED_AT = SYSTIMESTAMP -- Оновлюємо assigned_at при зміні статусу
            WHERE USER_ID = :userId AND ROLE_ID = :roleId
        `
        const binds = { userId, roleId, isActive: isActive ? 1 : 0 }
        const result = await executeQuery(sql, binds, { autoCommit: true })
        return result.rowsAffected === 1
    }
}

// export default new UserRoleModel();

// <==================================================================================>

// src/models/role.model.js
import { executeQuery } from '../utils/dbUtils.js'
import oracledb from 'oracledb'

class RoleModel {
    /**
     * Створює нову роль.
     * @param {string} roleName - Назва ролі.
     * @param {string} [description] - Опис ролі.
     * @returns {Promise<object>} Об'єкт створеної ролі.
     */
    async create(roleName, description = null) {
        const sql = `
            INSERT INTO ROLES (ROLE_NAME, DESCRIPTION)
            VALUES (:roleName, :description)
            RETURNING ROLE_ID, ROLE_NAME, DESCRIPTION, CREATED_AT INTO
                :out_roleId, :out_roleName, :out_description, :out_createdAt
        `
        const binds = {
            roleName,
            description,
            out_roleId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            out_roleName: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
            out_description: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
            out_createdAt: { type: oracledb.DATE, dir: oracledb.BIND_OUT },
        }
        const options = { autoCommit: true }
        const result = await executeQuery(sql, binds, options)
        const outBinds = result.outBinds
        return {
            roleId: outBinds.out_roleId[0],
            roleName: outBinds.out_roleName[0],
            description: outBinds.out_description[0],
            createdAt: outBinds.out_createdAt[0],
        }
    }

    /**
     * Отримує роль за ID.
     * @param {number} roleId - ID ролі.
     * @returns {Promise<object|null>} Об'єкт ролі або null.
     */
    async findById(roleId) {
        const sql = `
            SELECT ROLE_ID, ROLE_NAME, DESCRIPTION, CREATED_AT, UPDATED_AT
            FROM ROLES
            WHERE ROLE_ID = :roleId
        `
        const binds = { roleId }
        const result = await executeQuery(sql, binds)
        return result.rows.length > 0 ? result.rows[0] : null
    }

    /**
     * Отримує роль за назвою.
     * @param {string} roleName - Назва ролі.
     * @returns {Promise<object|null>} Об'єкт ролі або null.
     */
    async findByName(roleName) {
        const sql = `
            SELECT ROLE_ID, ROLE_NAME, DESCRIPTION, CREATED_AT, UPDATED_AT
            FROM ROLES
            WHERE ROLE_NAME = :roleName
        `
        const binds = { roleName }
        const result = await executeQuery(sql, binds)
        return result.rows.length > 0 ? result.rows[0] : null
    }

    /**
     * Отримує всі ролі.
     * @returns {Promise<Array<object>>} Масив об'єктів ролей.
     */
    async getAll() {
        const sql = `
            SELECT ROLE_ID, ROLE_NAME, DESCRIPTION, CREATED_AT, UPDATED_AT
            FROM ROLES
            ORDER BY ROLE_NAME
        `
        const result = await executeQuery(sql)
        return result.rows
    }

    /**
     * Оновлює роль.
     * @param {number} roleId - ID ролі.
     * @param {object} updates - Об'єкт з полями для оновлення.
     * @returns {Promise<boolean>} True, якщо оновлено, false, якщо ні.
     */
    async update(roleId, updates) {
        const setClauses = []
        const binds = { roleId }

        setClauses.push('UPDATED_AT = SYSTIMESTAMP')

        for (const key in updates) {
            if (
                updates.hasOwnProperty(key) &&
                ['ROLE_NAME', 'DESCRIPTION'].includes(key.toUpperCase())
            ) {
                setClauses.push(`${key.toUpperCase()} = :${key}`)
                binds[key] = updates[key]
            }
        }

        if (setClauses.length === 0) {
            return false
        }

        const sql = `
            UPDATE ROLES
            SET ${setClauses.join(', ')}
            WHERE ROLE_ID = :roleId
        `
        const result = await executeQuery(sql, binds, { autoCommit: true })
        return result.rowsAffected === 1
    }

    /**
     * Видаляє роль (фізично).
     * @param {number} roleId - ID ролі.
     * @returns {Promise<boolean>} True, якщо видалено, false, якщо ні.
     */
    async delete(roleId) {
        const sql = `
            DELETE FROM ROLES
            WHERE ROLE_ID = :roleId
        `
        const binds = { roleId }
        const result = await executeQuery(sql, binds, { autoCommit: true })
        return result.rowsAffected === 1
    }
}

// export default new RoleModel();

// <==========================================================>

// src/models/user.model.js
import { executeQuery } from '../utils/dbUtils.js'
import oracledb from 'oracledb'

class UserModel {
    /**
     * Створює нового користувача.
     * @param {object} userData - Об'єкт з даними користувача.
     * @param {string} userData.username
     * @param {string} userData.email
     * @param {string} userData.passwordHash
     * @param {string} userData.salt
     * @param {string} [userData.firstName]
     * @param {string} [userData.lastName]
     * @param {string} [userData.verificationCode]
     * @param {Date} [userData.verificationExpiration]
     * @returns {Promise<object>} Об'єкт створеного користувача.
     */
    async create(userData) {
        const sql = `
            INSERT INTO USERS (
                USERNAME, EMAIL, PASSWORD_HASH, SALT, FIRST_NAME, LAST_NAME,
                VERIFICATION_CODE, VERIFICATION_EXPIRATION, IS_EMAIL_VERIFIED
            ) VALUES (
                :username, :email, :passwordHash, :salt, :firstName, :lastName,
                :verificationCode, :verificationExpiration, :isEmailVerified
            ) RETURNING USER_ID, USERNAME, EMAIL, IS_ACTIVE, IS_EMAIL_VERIFIED, CREATED_AT INTO
                :out_userId, :out_username, :out_email, :out_isActive, :out_isEmailVerified, :out_createdAt
        `
        const binds = {
            username: userData.username,
            email: userData.email,
            passwordHash: userData.passwordHash,
            salt: userData.salt,
            firstName: userData.firstName || null,
            lastName: userData.lastName || null,
            verificationCode: userData.verificationCode || null,
            verificationExpiration: userData.verificationExpiration || null,
            isEmailVerified:
                userData.isEmailVerified !== undefined ? (userData.isEmailVerified ? 1 : 0) : 0, // За замовчуванням 0
            out_userId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            out_username: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
            out_email: { type: oracledb.STRING, dir: oracledb.BIND_OUT },
            out_isActive: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            out_isEmailVerified: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            out_createdAt: { type: oracledb.DATE, dir: oracledb.BIND_OUT },
        }
        const options = {
            autoCommit: true,
            bindDefs: {
                username: { type: oracledb.STRING, maxSize: 50 },
                email: { type: oracledb.STRING, maxSize: 100 },
                passwordHash: { type: oracledb.STRING, maxSize: 255 },
                salt: { type: oracledb.STRING, maxSize: 255 },
                firstName: { type: oracledb.STRING, maxSize: 50 },
                lastName: { type: oracledb.STRING, maxSize: 50 },
                verificationCode: { type: oracledb.STRING, maxSize: 64 },
                verificationExpiration: { type: oracledb.DATE },
                isEmailVerified: { type: oracledb.NUMBER },
            },
        }

        const result = await executeQuery(sql, binds, options)
        const outBinds = result.outBinds

        return {
            userId: outBinds.out_userId[0],
            username: outBinds.out_username[0],
            email: outBinds.out_email[0],
            isActive: outBinds.out_isActive[0] === 1,
            isEmailVerified: outBinds.out_isEmailVerified[0] === 1,
            createdAt: outBinds.out_createdAt[0],
        }
    }

    /**
     * Отримує користувача за ID. Включає ролі.
     * @param {number} userId - ID користувача.
     * @param {boolean} [includeDeleted=false] - Чи включати м'яко видалених користувачів.
     * @returns {Promise<object|null>} Об'єкт користувача або null.
     */
    async findById(userId, includeDeleted = false) {
        const sql = `
            SELECT
                U.USER_ID, U.USERNAME, U.EMAIL, U.FIRST_NAME, U.LAST_NAME,
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
                U.USER_ID, U.USERNAME, U.EMAIL, U.FIRST_NAME, U.LAST_NAME,
                U.IS_ACTIVE, U.IS_EMAIL_VERIFIED, U.CREATED_AT, U.UPDATED_AT, U.DELETED_AT, U.LAST_LOGIN_AT,
                U.TWO_FACTOR_SECRET, U.VERIFICATION_CODE, U.VERIFICATION_EXPIRATION,
                U.PASSWORD_RESET_TOKEN, U.PASSWORD_RESET_EXPIRATION
        `
        const binds = { userId }
        const result = await executeQuery(sql, binds)
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
        return user
    }

    /**
     * Отримує користувача за іменем користувача (username). Включає ролі.
     * @param {string} username - Ім'я користувача.
     * @param {boolean} [includeDeleted=false] - Чи включати м'яко видалених користувачів.
     * @returns {Promise<object|null>} Об'єкт користувача або null.
     */
    async findByUsername(username, includeDeleted = false) {
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
        const result = await executeQuery(sql, binds)
        if (result.rows.length === 0) {
            return null
        }
        const user = result.rows[0]
        if (user.ROLES) {
            user.ROLES = user.ROLES.split(',')
        } else {
            user.ROLES = []
        }
        return user
    }

    /**
     * Отримує користувача за Email. Включає ролі.
     * @param {string} email - Електронна пошта користувача.
     * @param {boolean} [includeDeleted=false] - Чи включати м'яко видалених користувачів.
     * @returns {Promise<object|null>} Об'єкт користувача або null.
     */
    async findByEmail(email, includeDeleted = false) {
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
        const result = await executeQuery(sql, binds)
        if (result.rows.length === 0) {
            return null
        }
        const user = result.rows[0]
        if (user.ROLES) {
            user.ROLES = user.ROLES.split(',')
        } else {
            user.ROLES = []
        }
        return user
    }

    /**
     * Оновлює дані користувача.
     * @param {number} userId - ID користувача.
     * @param {object} updates - Об'єкт з полями для оновлення.
     * @returns {Promise<boolean>} True, якщо оновлено, false, якщо ні.
     */
    async update(userId, updates) {
        const setClauses = []
        const binds = { userId }

        // Автоматичне оновлення UPDATED_AT
        setClauses.push('UPDATED_AT = SYSTIMESTAMP')

        for (const key in updates) {
            if (updates.hasOwnProperty(key)) {
                // Захист від оновлення USER_ID, CREATED_AT тощо.
                if (
                    ['USER_ID', 'CREATED_AT', 'DELETED_AT', 'UPDATED_AT'].includes(
                        key.toUpperCase(),
                    )
                ) {
                    continue
                }
                setClauses.push(`${key.toUpperCase()} = :${key}`)
                // Для boolean полів перетворюємо на 0/1
                if (typeof updates[key] === 'boolean') {
                    binds[key] = updates[key] ? 1 : 0
                } else {
                    binds[key] = updates[key]
                }
            }
        }

        if (setClauses.length === 0) {
            return false // Нічого оновлювати
        }

        const sql = `
            UPDATE USERS
            SET ${setClauses.join(', ')}
            WHERE USER_ID = :userId
        `

        const result = await executeQuery(sql, binds, { autoCommit: true })
        return result.rowsAffected === 1
    }

    /**
     * М'яке видалення користувача (встановлює DELETED_AT).
     * @param {number} userId - ID користувача.
     * @returns {Promise<boolean>} True, якщо видалено, false, якщо ні.
     */
    async softDelete(userId) {
        const sql = `
            UPDATE USERS
            SET DELETED_AT = SYSTIMESTAMP, IS_ACTIVE = 0, UPDATED_AT = SYSTIMESTAMP
            WHERE USER_ID = :userId AND DELETED_AT IS NULL
        ` // Перевірка DELETED_AT IS NULL, щоб не оновлювати вже видалених
        const binds = { userId }
        const result = await executeQuery(sql, binds, { autoCommit: true })
        return result.rowsAffected === 1
    }

    /**
     * Відновлення м'яко видаленого користувача (встановлює DELETED_AT в NULL).
     * @param {number} userId - ID користувача.
     * @returns {Promise<boolean>} True, якщо відновлено, false, якщо ні.
     */
    async restore(userId) {
        const sql = `
            UPDATE USERS
            SET DELETED_AT = NULL, IS_ACTIVE = 1, UPDATED_AT = SYSTIMESTAMP
            WHERE USER_ID = :userId AND DELETED_AT IS NOT NULL
        `
        const binds = { userId }
        const result = await executeQuery(sql, binds, { autoCommit: true })
        return result.rowsAffected === 1
    }

    /**
     * Пошук користувача за верифікаційним кодом.
     * @param {string} code - Верифікаційний код.
     * @returns {Promise<object|null>} Об'єкт користувача або null.
     */
    async findByVerificationCode(code) {
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
        const result = await executeQuery(sql, binds)
        if (result.rows.length === 0) {
            return null
        }
        return result.rows[0]
    }

    /**
     * Пошук користувача за токеном скидання пароля.
     * @param {string} token - Токен скидання пароля.
     * @returns {Promise<object|null>} Об'єкт користувача або null.
     */
    async findByPasswordResetToken(token) {
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
        const result = await executeQuery(sql, binds)
        if (result.rows.length === 0) {
            return null
        }
        return result.rows[0]
    }

    /**
     * Отримує список усіх користувачів.
     * @param {object} [filters={}] - Об'єкт фільтрів (наприклад, { isActive: true }).
     * @param {boolean} [includeDeleted=false] - Чи включати м'яко видалених користувачів.
     * @param {number} [limit] - Максимальна кількість результатів.
     * @param {number} [offset] - Зміщення для пагінації.
     * @returns {Promise<Array<object>>} Масив об'єктів користувачів.
     */
    async getAll(filters = {}, includeDeleted = false, limit, offset) {
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
            // Фільтруємо за роллю. Потрібен підзапит або більш складний GROUP BY/HAVING
            // Для спрощення, тут припускаємо, що LISTAGG повертає унікальні ролі без пробілів
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
            sql += ` OFFSET ${offset || 0} ROWS FETCH NEXT ${limit} ROWS ONLY`
        }

        const result = await executeQuery(sql, binds)
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
    }
}

// export default new UserModel();

// <===================================================================>
