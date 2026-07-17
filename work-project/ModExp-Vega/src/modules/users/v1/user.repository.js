import { getContext } from '../../../common/utils/context.js'

export class UserRepository {
    /**
     * @param {Object} dbManager - Менеджер динамічних підключень до БД
     */
    constructor(dbManager) {
        this.dbManager = dbManager
    }

    /**
     * Отримує екзекутор БД на основі поточного контексту запиту
     * @private
     */
    async _getExecutor(overrideDbName = null) {
        // 1. Перевіряємо, чи ініціалізовано dbManager у класі
        if (!this.dbManager || typeof this.dbManager.get !== 'function') {
            throw new Error('Database manager is not initialized or missing "get" method')
        }

        const context = getContext() || {}
        const dbName = overrideDbName || context.dbName

        // 2. Перевіряємо наявність імені бази даних
        if (!dbName) {
            throw new Error('Database context (dbName) is missing')
        }

        // 3. Отримуємо екзекутор
        const executor = await this.dbManager.get(dbName)

        // 4. Перевіряємо, чи вдалося знайти екзекутор для цієї БД
        if (!executor) {
            throw new Error(`Database executor not found for database: "${dbName}"`)
        }

        return executor
    }

    // /**
    //  * Створення нового користувача в базі даних (Реєстрація)
    //  */
    // async createUser({ userLogin, email, passwordHash, firstName, lastName, middleName }) {
    //     const dbService = await this._getExecutor()

    //     const sql = `
    //         INSERT INTO USERS (USER_LOGIN, EMAIL, PASSWORD_HASH, FIRST_NAME, LAST_NAME, MIDDLE_NAME)
    //         VALUES (:userLogin, :email, :passwordHash, :firstName, :lastName, :middleName)
    //         RETURNING ID INTO :id
    //     `

    //     const bindVars = {
    //         userLogin,
    //         email,
    //         passwordHash,
    //         firstName,
    //         lastName,
    //         middleName,
    //         id: {
    //             type: dbService.oracledb.NUMBER,
    //             dir: dbService.oracledb.BIND_OUT,
    //         },
    //     }

    //     const result = await dbService.execute(sql, bindVars)

    //     // Витягуємо згенерований ID
    //     const createdId = result.outBinds?.id?.[0] || result.outBinds?.id

    //     return {
    //         id: createdId,
    //         userLogin,
    //         email,
    //         firstName,
    //         lastName,
    //         middleName,
    //     }
    // }

    /**
     * Пошук користувача за унікальним логіном (використовується при автентифікації)
     */
    async findUserByLogin(userLogin) {
        const dbService = await this._getExecutor()

        const sql = `
            select
                id,
                tab_no,
                username,
                id_org,
                tseh_id,
                tseh,
                familia,
                imya,
                otchestvo


            from USERS_V uv
            where 1 = 1
            and username = :userLogin
        `

        const result = await dbService.execute(sql, { userLogin })
        return result.rows?.[0] || null
    }

    // /**
    //  * Фіксація невдалої спроби входу користувача (Захист від Brute-Force атак).
    //  * Якщо ліміт помилок (наприклад, 5) перевищено, акаунт заморожується на lockTimeMinutes.
    //  */
    // async incrementFailedAttempts(userId, lockTimeMinutes = 15) {
    //     const dbService = await this._getExecutor()

    //     const sql = `
    //         UPDATE USERS
    //         SET FAILED_LOGIN_ATTEMPTS = FAILED_LOGIN_ATTEMPTS + 1,
    //             LOCKED_UNTIL = CASE WHEN FAILED_LOGIN_ATTEMPTS + 1 >= 5
    //                                 THEN CURRENT_TIMESTAMP + NUMTODSINTERVAL(:lockTimeMinutes, 'MINUTE')
    //                             ELSE NULL END
    //         WHERE ID = :userId
    //     `

    //     return await dbService.execute(sql, { userId, lockTimeMinutes })
    // }

    // /**
    //  * Скидання лічильника спроб брутфорсу у 0 при успішному вході
    //  * Також оновлює часову мітку LAST_LOGIN_AT
    //  */
    // async resetFailedAttempts(userId) {
    //     const dbService = await this._getExecutor()

    //     const sql = `
    //         UPDATE USERS
    //         SET FAILED_LOGIN_ATTEMPTS = 0,
    //             LOCKED_UNTIL = NULL,
    //             LAST_LOGIN_AT = CURRENT_TIMESTAMP
    //         WHERE ID = :userId
    //     `

    //     return await dbService.execute(sql, { userId })
    // }

    // /**
    //  * Перевірка наявності дозволу у користувача на доступ до конкретного додатка
    //  */
    // async checkUserAccessToApp(userId, appId) {
    //     const dbService = await this._getExecutor()

    //     const sql = `
    //         select
    //             count(*) as ACCESS_COUNT
    //         from USER_APPS_V
    //         where 1 = 1
    //             and user_id = :userId
    //             and app_code = :appId
    //             and is_active = 1
    //     `

    //     const result = await dbService.execute(sql, { userId, appId })

    //     // Oracle залежно від налаштувань повертає ключі в UPPERCASE або масивом.
    //     // Перевіряємо за назвою аліасу з SQL-запиту:
    //     const count = result.rows?.[0]?.ACCESS_COUNT || result.rows?.[0]?.[0] || 0

    //     return count > 0
    // }

    /**
     * Отримання списку кодів додатків, до яких користувач має доступ
     */
    async getUserAllowedApps(userId) {
        const dbService = await this._getExecutor()

        // Запит повертає рядки: кожен рядок — це один APP_CODE
        const sql = `
            select
                uname,
                rname
            from cmo.user_all_role_mv
            where 1 = 1
                and uname = :userId
        `

        const result = await dbService.execute(sql, { userId })

        // Перетворюємо масив об'єктів [ { APP_CODE: 'CRM' }, { APP_CODE: 'B2B' } ]
        // у плоский масив рядків [ 'CRM', 'B2B' ]
        if (!result || !result.rows || result.rows.length === 0) {
            return []
        }

        return result.rows.map((row) => row.RNAME)
    }
}
