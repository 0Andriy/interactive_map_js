import { getContext } from '../../../common/utils/context.js'

/**
 * @typedef {Object} RefreshTokenEntity
 * @property {number} ID - Унікальний ідентифікатор сесії
 * @property {number} USER_ID - Ідентифікатор користувача
 * @property {string} USER_LOGIN - Логін користувача
 * @property {string|null} APP_ID - Ідентифікатор додатка (може бути null)
 * @property {string} JTI - JWT ID токена
 * @property {string} TOKEN_HASH - SHA-256 хеш токена
 * @property {string|null} DEVICE_FINGERPRINT - Хеш відбитка пристрою
 * @property {number} ROTATION_COUNT - Кількість ротацій токена
 * @property {string} EXPIRES_AT - Дата закінчення дії в ISO форматі
 * @property {string|null} REVOKED_AT - Дата відкликання сесії в ISO форматі
 * @property {string|null} PARENT_JTI - JTI попереднього токена в ланцюжку
 */

/**
 * Репозиторій для керування сесіями користувачів (Refresh-токенами) в Oracle СУБД.
 */
export class SessionRepository {
    /**
     * @param {Object} dbManager - Менеджер динамічних підключень до Oracle (Multi-Tenant)
     */
    constructor(dbManager) {
        this.dbManager = dbManager
    }

    /**
     * Отримує сервіс виконання записів на основі контексту бази даних.
     * @private
     * @param {string|null} [overrideDbName=null] - Назва БД для перевизначення контексту
     * @returns {Promise<Object>} Екземпляр сервісу бази даних
     * @throws {Error} Якщо назва БД відсутня в контексті
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

    /**
     * Зберігає новий Refresh-токен сесії в базі даних.
     * @param {Object} params - Параметри сесії
     * @param {number} params.userId - Ідентифікатор користувача
     * @param {string} params.login - Логін користувача
     * @param {string|null} [params.appId=null] - Ідентифікатор клієнтського додатка (опціонально)
     * @param {string} params.jti - Унікальний UUID токена (JWT ID)
     * @param {string} params.tokenHash - SHA-256 хеш від чистого токена
     * @param {Date|string} params.expiresAt - Дата закінчення дії токена
     * @param {string|null} params.userAgent - Рядок User-Agent клієнта
     * @param {string|null} params.ipAddress - IP-адреса клієнта
     * @param {string|null} [params.deviceFingerprint=null] - Хеш унікального відбитка пристрою
     * @param {string|null} [params.parentJti=null] - JTI батьківського токена для відстеження ротації
     * @param {number} [params.rotationCount=0] - Поточний номер кроку ротації в ланцюжку
     * @returns {Promise<Object>} Результат виконання операції INSERT
     */
    async saveRefreshToken({
        userId,
        login,
        appId = null,
        jti,
        tokenHash,
        expiresAt,
        userAgent,
        ipAddress,
        deviceFingerprint = null,
        parentJti = null,
        rotationCount = 0,
    }) {
        const dbService = await this._getExecutor()

        const sql = `
            INSERT INTO REFRESH_TOKENS (
                USER_ID, USER_LOGIN, APP_ID, JTI, TOKEN_HASH,
                EXPIRES_AT, USER_AGENT, IP_ADDRESS, DEVICE_FINGERPRINT,
                PARENT_JTI, ROTATION_COUNT
            ) VALUES (
                :userId, :login, :appId, :jti, :tokenHash,
                :expiresAt, :userAgent, :ipAddress, :deviceFingerprint,
                :parentJti, :rotationCount
            )
        `

        return await dbService.execute(sql, {
            userId,
            login,
            appId,
            jti,
            tokenHash,
            expiresAt,
            userAgent,
            ipAddress,
            deviceFingerprint,
            parentJti,
            rotationCount,
        })
    }

    /**
     * Знаходить токен за його хешем (зазвичай для процедури ротації/валідації).
     * @param {string} tokenHash - SHA-256 хеш токена
     * @returns {Promise<RefreshTokenEntity|null>} Об'єкт сесії або null, якщо не знайдено
     */
    async findRefreshTokenByHash(tokenHash) {
        const dbService = await this._getExecutor()

        const sql = `
            SELECT
                ID,
                USER_ID,
                USER_LOGIN,
                APP_ID,
                TOKEN_HASH,
                JTI,
                PARENT_JTI,
                DEVICE_FINGERPRINT,
                ROTATION_COUNT,
                TO_CHAR(EXPIRES_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as EXPIRES_AT,
                TO_CHAR(REVOKED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as REVOKED_AT

            FROM REFRESH_TOKENS
            WHERE TOKEN_HASH = :tokenHash
        `

        const result = await dbService.execute(sql, { tokenHash })
        return result.rows?.[0] || null
    }

    /**
     * Знаходить токен за хешем з песимістичним блокуванням та розрахунком вікна Grace Period.
     * @param {string} tokenHash - SHA-256 хеш токена
     * @param {number} [gracePeriodSeconds=15] - Вікно благодаті у секундах
     * @returns {Promise<Object|null>} Об'єкт сесії з прапором IS_GRACE_VALID
     */
    async findSessionForRefresh(tokenHash, gracePeriodSeconds = 15) {
        const dbService = await this._getExecutor()

        const sql = `
            SELECT
                ID,
                USER_ID,
                USER_LOGIN,
                APP_ID,
                TOKEN_HASH,
                JTI,
                PARENT_JTI,
                DEVICE_FINGERPRINT, ROTATION_COUNT, REVOKE_REASON,
                TO_CHAR(EXPIRES_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as EXPIRES_AT,
                TO_CHAR(REVOKED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as REVOKED_AT,

                -- Якщо токен відкликаний, перевіряємо чи вкладається він у вікно благодаті
                CASE
                    WHEN REVOKED_AT IS NOT NULL
                        AND REVOKE_REASON = 'rotated'
                        AND REVOKED_AT >= CURRENT_TIMESTAMP - NUMTODSINTERVAL(:gracePeriodSeconds, 'SECOND')
                    THEN 1
                    ELSE 0
                END as IS_GRACE_VALID

            FROM REFRESH_TOKENS
            WHERE TOKEN_HASH = :tokenHash
        `

        const result = await dbService.execute(sql, { tokenHash, gracePeriodSeconds })
        return result.rows?.[0] || null
    }

    /**
     * Знаходить сесію за унікальним JWT ID (JTI).
     * @param {string} jti - JWT ID (UUID сесії)
     * @returns {Promise<RefreshTokenEntity|null>} Об'єкт сесії або null, якщо не знайдено
     */
    async findSessionByJti(jti) {
        const dbService = await this._getExecutor()

        const sql = `
            SELECT
                ID,
                USER_ID,
                USER_LOGIN,
                APP_ID,
                TOKEN_HASH,
                JTI,
                PARENT_JTI,
                DEVICE_FINGERPRINT,
                ROTATION_COUNT,
                TO_CHAR(EXPIRES_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as EXPIRES_AT,
                TO_CHAR(REVOKED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as REVOKED_AT

            FROM REFRESH_TOKENS
            WHERE JTI = :jti
        `

        const result = await dbService.execute(sql, { jti })
        return result.rows?.[0] || null
    }

    /**
     * Знаходить токен за ідентифікатором його батьківського токена (PARENT_JTI).
     * Використовується для відновлення сесії під час Grace Period.
     * @param {string} parentJti - JTI попереднього токена
     * @returns {Promise<RefreshTokenEntity|null>} Об'єкт наступного токена в ланцюжку або null
     */
    async findSessionByParentJti(parentJti) {
        const dbService = await this._getExecutor()

        const sql = `
            SELECT
                ID,
                USER_ID,
                USER_LOGIN,
                APP_ID,
                TOKEN_HASH,
                JTI,
                PARENT_JTI,
                DEVICE_FINGERPRINT,
                ROTATION_COUNT,
                REVOKE_REASON,
                TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as CREATED_AT,
                TO_CHAR(EXPIRES_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as EXPIRES_AT,
                TO_CHAR(REVOKED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as REVOKED_AT

            FROM REFRESH_TOKENS
            WHERE PARENT_JTI = :parentJti
        `

        const result = await dbService.execute(sql, { parentJti })
        return result.rows?.[0] || null
    }

    /**
     * Перевіряє, чи токен був оновлений зовсім нещодавно в межах пільгового періоду (Grace Period).
     * Допомагає уникнути помилкового розлогування через затримки мережі на клієнті.
     * @param {string} tokenHash - SHA-256 хеш токена
     * @param {number} [gracePeriodSeconds=30] - Тривалість пільгового вікна у секундах
     * @returns {Promise<RefreshTokenEntity|null>} Об'єкт сесії, якщо вона підходить під критерії Grace Period
     */
    async findRotatedSessionWithGrace(tokenHash, gracePeriodSeconds = 30) {
        const dbService = await this._getExecutor()

        const sql = `
            SELECT
                ID,
                USER_ID,
                USER_LOGIN,
                APP_ID,
                TOKEN_HASH,
                JTI,
                PARENT_JTI,
                DEVICE_FINGERPRINT, ROTATION_COUNT, REVOKE_REASON,
                TO_CHAR(EXPIRES_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as EXPIRES_AT,
                TO_CHAR(REVOKED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as REVOKED_AT

            FROM REFRESH_TOKENS
            WHERE TOKEN_HASH = :tokenHash
                AND REVOKE_REASON = 'rotated'
                AND REVOKED_AT >= CURRENT_TIMESTAMP - NUMTODSINTERVAL(:gracePeriodSeconds, 'SECOND')
        `

        const result = await dbService.execute(sql, { tokenHash, gracePeriodSeconds })
        return result.rows?.[0] || null
    }

    /**
     * Шукає активного "нащадка" сесії (токен, який був випущений на основі поточного parentJti).
     * Використовується для виявлення атаки повторного використання токена (Token Reuse).
     * @param {string} parentJti - Батьківський JTI токена
     * @returns {Promise<RefreshTokenEntity|null>} Нащадок сесії або null
     */
    async findChildSessionByParentJti(parentJti) {
        const dbService = await this._getExecutor()

        const sql = `
            SELECT
                ID,
                USER_ID,
                USER_LOGIN,
                APP_ID,
                TOKEN_HASH,
                JTI,
                PARENT_JTI,
                DEVICE_FINGERPRINT,
                ROTATION_COUNT,
                TO_CHAR(EXPIRES_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as EXPIRES_AT

            FROM REFRESH_TOKENS
            WHERE PARENT_JTI = :parentJti
                AND REVOKED_AT IS NULL
        `

        const result = await dbService.execute(sql, { parentJti })
        return result.rows?.[0] || null
    }

    /**
     * Анулює конкретний токен (наприклад, під час явного Logout).
     * @param {number} id - Числовий ID запису в БД
     * @param {string} [reason='logout'] - Причина закриття сесії
     * @returns {Promise<Object>} Результат виконання UPDATE
     */
    async revokeToken(id, reason = 'logout') {
        const dbService = await this._getExecutor()

        const sql = `
            UPDATE REFRESH_TOKENS
            SET
                REVOKED_AT = CURRENT_TIMESTAMP,
                REVOKE_REASON = :reason
            WHERE ID = :id
                AND REVOKED_AT IS NULL
        `

        return await dbService.execute(sql, { id, reason })
    }

    /**
     * Оновлює хеш токена та термін придатності для існуючого запису.
     * Зазвичай використовується в сценаріях Grace Period для запобігання Race Conditions у мережі.
     * @param {number} id - Числовий ID запису
     * @param {string} newTokenHash - Новий SHA-256 хеш токена
     * @param {Date|string} newExpiresAt - Нова дата експірації
     * @returns {Promise<Object>} Результат виконання UPDATE
     */
    async updateTokenHash(id, newTokenHash, newExpiresAt) {
        const dbService = await this._getExecutor()

        const sql = `
            UPDATE REFRESH_TOKENS
            SET
                TOKEN_HASH = :newTokenHash,
                EXPIRES_AT = :newExpiresAt,
                REVOKE_REASON = 'grace_period_recovery' -- Фіксуємо факт відновлення після збою мережі
            WHERE ID = :id
        `

        return await dbService.execute(sql, {
            id,
            newTokenHash,
            newExpiresAt,
        })
    }

    /**
     * Анулює весь ієрархічний ланцюжок токенів у випадку виявлення компрометації ротації.
     * Працює на базі рекурсивного ієрархічного запиту Oracle (CONNECT BY PRIOR).
     * @param {string} rootJti - Первинний (батьківський) JTI з якого почався витік
     * @param {string} [reason='compromised_chain'] - Причина примусового бану
     * @returns {Promise<Object>} Результат виконання UPDATE
     */
    async revokeCompromisedChain(rootJti, reason = 'compromised_chain') {
        const dbService = await this._getExecutor()

        const sql = `
            UPDATE REFRESH_TOKENS
            SET
                REVOKED_AT = CURRENT_TIMESTAMP,
                REVOKE_REASON = :reason
            WHERE REVOKED_AT IS NULL
                AND JTI IN (
                SELECT JTI FROM REFRESH_TOKENS
                START WITH JTI = :rootJti
                CONNECT BY PRIOR JTI = PARENT_JTI
            )
        `

        return await dbService.execute(sql, { rootJti, reason })
    }

    /**
     * Контролює та обмежує максимальну кількість одночасних активних сесій
     * користувача в межах конкретного додатка (або серед сесій без додатка).
     * Найстаріші активні сесії понад ліміт будуть автоматично закриті.
     * @param {number} userId - Ідентифікатор користувача
     * @param {string|null} [appId=null] - Ідентифікатор клієнтського додатка (опціонально)
     * @param {number} maxSessions - Максимально дозволена кількість сесій
     * @returns {Promise<Object|null>} Результат виконання UPDATE або null, якщо ліміт не задано
     */
    async enforceSessionLimit(userId, appId = null, maxSessions) {
        if (maxSessions === null || maxSessions === undefined) return null

        const dbService = await this._getExecutor()

        const sql = `
            UPDATE REFRESH_TOKENS
            SET
                REVOKED_AT = CURRENT_TIMESTAMP,
                REVOKE_REASON = 'session_limit_exceeded'

            WHERE USER_ID = :userId
                AND (APP_ID = :appId OR (APP_ID IS NULL AND :appId IS NULL))
                AND REVOKED_AT IS NULL
                AND ID NOT IN (
                    SELECT
                        ID
                    FROM (
                        SELECT
                            ID
                        FROM REFRESH_TOKENS
                        WHERE USER_ID = :userId
                            AND (APP_ID = :appId OR (APP_ID IS NULL AND :appId IS NULL))
                            AND REVOKED_AT IS NULL
                        ORDER BY CREATED_AT DESC
                        )
                    WHERE ROWNUM <= :maxSessions
                )
        `

        return await dbService.execute(sql, { userId, appId, maxSessions })
    }

    /**
     * Повертає список усіх активних сесій користувача (наприклад, для відображення в особистому кабінеті).
     * @param {number} userId - Ідентифікатор користувача
     * @returns {Promise<Array<RefreshTokenEntity>>} Список активних сесій
     */
    async findAllActiveSessionsByUserId(userId) {
        const dbService = await this._getExecutor()

        const sql = `
            SELECT
                ID,
                APP_ID,
                JTI,
                USER_AGENT,
                IP_ADDRESS,
                DEVICE_FINGERPRINT,
                ROTATION_COUNT,
                TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as CREATED_AT,
                TO_CHAR(UPDATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as UPDATED_AT,
                TO_CHAR(EXPIRES_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as EXPIRES_AT

            FROM REFRESH_TOKENS
            WHERE USER_ID = :userId
                AND REVOKED_AT IS NULL
                AND EXPIRES_AT > CURRENT_TIMESTAMP
            ORDER BY UPDATED_AT DESC
        `

        const result = await dbService.execute(sql, { userId })
        return result.rows || []
    }

    /**
     * Видаляє старі протерміновані або давно відкликані сесії з бази даних (Очищення логів/GDPR).
     * Зазвичай запускається через Cron-планувальник.
     * @param {number} [retentionDaysOfLogs=7] - Кількість днів для зберігання історичних закритих сесій
     * @param {string|null} [overrideDbName=null] - Назва конкретної БД (якщо виклик йде поза контекстом запиту)
     * @returns {Promise} Кількість фактично видалених рядків з таблиці
     */
    async deleteExpiredSessions(retentionDaysOfLogs = 7, overrideDbName = null) {
        const dbService = await this._getExecutor(overrideDbName)

        // SQL для Oracle СУБД
        const sql = `
            DELETE FROM REFRESH_TOKENS
            WHERE EXPIRES_AT < CURRENT_TIMESTAMP
                OR (
                    REVOKED_AT < CURRENT_TIMESTAMP - NUMTODSINTERVAL(:retentionDaysOfLogs, 'DAY')
                    AND REVOKE_REASON IN ('rotated', 'logout', 'grace_period_recovery', 'session_limit_exceeded')
                )
        `

        const result = await dbService.execute(sql, { retentionDaysOfLogs })

        // Повертаємо кількість видалених рядків для логування в Cron
        return result.rowsAffected || 0
    }

    /**
     * Примусово закриває взагалі всі активні сесії користувача у всіх додатках.
     * Наприклад, при тотальному блокуванні користувача або глобальному скиданні пароля.
     * @param {number} userId - Ідентифікатор користувача
     * @param {string} [reason='password_changed'] - Причина закриття всіх сесій
     * @returns {Promise} Результат виконання UPDATE
     */
    async revokeAllSessionsByUserId(userId, reason = 'password_changed') {
        const dbService = await this._getExecutor()

        const sql = `
            UPDATE REFRESH_TOKENS
            SET
                REVOKED_AT = CURRENT_TIMESTAMP,
                REVOKE_REASON = :reason,
                UPDATED_AT = CURRENT_TIMESTAMP

            WHERE USER_ID = :userId
                AND REVOKED_AT IS NULL
                AND EXPIRES_AT > CURRENT_TIMESTAMP
        `

        return await dbService.execute(sql, { userId, reason })
    }

    /**
     * Примусово закриває всі активні сесії користувача у всіх додатках, окрім поточної сесії.
     * Реалізує функціонал кнопки "Вийти на всіх інших пристроях".
     * @param {number} userId - Ідентифікатор користувача
     * @param {string} currentJti - JTI поточної активної сесії, яку НЕ треба закривати
     * @param {string} [reason='password_changed'] - Причина закриття сесій
     * @returns {Promise} Результат виконання UPDATE
     */
    async revokeAllSessionsByUserIdExceptCurrent(userId, currentJti, reason = 'password_changed') {
        const dbService = await this._getExecutor()

        const sql = `
            UPDATE REFRESH_TOKENS
            SET
                REVOKED_AT = CURRENT_TIMESTAMP,
                REVOKE_REASON = :reason,
                UPDATED_AT = CURRENT_TIMESTAMP

            WHERE USER_ID = :userId
                AND REVOKED_AT IS NULL
                AND EXPIRES_AT > CURRENT_TIMESTAMP
                AND JTI != :currentJti
        `

        return await dbService.execute(sql, { userId, currentJti, reason })
    }

    /**
     * Знаходить останню активну сесію за відбитком пристрою та користувачем.
     * Використовується для детекції зміни контексту пристрою.
     * @param {number} userId - Ідентифікатор користувача
     * @param {string} deviceFingerprint - SHA-256 хеш відбитка пристрою
     * @returns {Promise<RefreshTokenEntity|null>} Об'єкт сесії або null
     */
    async findLatestSessionByFingerprint(userId, deviceFingerprint) {
        if (!deviceFingerprint) return null

        const dbService = await this._getExecutor()

        const sql = `
            SELECT
                *
            FROM (
                SELECT
                    ID, USER_ID, APP_ID, JTI, TOKEN_HASH, DEVICE_FINGERPRINT,
                    TO_CHAR(EXPIRES_AT, 'YYYY-MM-DD"T"HH24:MI:SS') as EXPIRES_AT
                FROM REFRESH_TOKENS
                WHERE USER_ID = :userId
                    AND DEVICE_FINGERPRINT = :deviceFingerprint
                    AND REVOKED_AT IS NULL
                ORDER BY CREATED_AT DESC
            ) WHERE ROWNUM = 1
        `

        const result = await dbService.execute(sql, { userId, deviceFingerprint })
        return result.rows?.[0] || null
    }

    /**
     * Рахує кількість підозрілих або скомпрометованих сесій користувача за останній час.
     * Використовується системами захисту (Anti-Fraud) для виявлення Brute-force чи аномальної ротації.
     * @param {number} userId - Ідентифікатор користувача
     * @param {number} [rotationThreshold=30] - Поріг кількості ротацій, що вважається аномальним
     * @returns {Promise<number>} Кількість підозрілих записів
     */
    async getSuspiciousSessionsCount(userId, rotationThreshold = 30) {
        const dbService = await this._getExecutor()

        const sql = `
            SELECT
                COUNT(*) AS SUSPICIOUS_COUNT
            FROM REFRESH_TOKENS
            WHERE USER_ID = :userId
                AND (
                    ROTATION_COUNT > :rotationThreshold
                    OR REVOKE_REASON = 'compromised_chain'
                    OR (REVOKED_AT IS NOT NULL AND EXPIRES_AT < REVOKED_AT) -- токен анульовано раніше, ніж він сам згас
                )
                AND CREATED_AT >= CURRENT_TIMESTAMP - NUMTODSINTERVAL(1, 'DAY')
        `

        const result = await dbService.execute(sql, { userId, rotationThreshold })
        return result.rows?.[0]?.SUSPICIOUS_COUNT || 0
    }

    /**
     * Перевіряє, чи є JTI заблокованим або відкликаним.
     * @param {string} jti - Унікальний ідентифікатор JWT
     * @returns {Promise<boolean>} true — якщо токен анульовано/скомпрометовано, false — якщо активний або не існує
     */
    async isJtiBlacklisted(jti) {
        const dbService = await this._getExecutor()

        const sql = `
            SELECT
                1
            FROM REFRESH_TOKENS
            WHERE JTI = :jti
                AND (REVOKED_AT IS NOT NULL OR EXPIRES_AT < CURRENT_TIMESTAMP)
        `

        const result = await dbService.execute(sql, { jti })
        return (result.rows?.length || 0) > 0
    }
}
