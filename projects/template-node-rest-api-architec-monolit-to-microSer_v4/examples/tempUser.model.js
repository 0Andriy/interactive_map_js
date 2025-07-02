/**
 * Отримує список користувачів з підтримкою фільтрації, пошуку, пагінації, сортування.
 *
 * @param {string} dbName - Назва бази даних.
 * @param {object} [filters={}] - Обʼєкт фільтрів (наприклад, { isActive: true, role: 'admin' }).
 * @param {boolean} [includeDeleted=false] - Чи включати soft-deleted користувачів.
 * @param {number} [limit] - Кількість результатів (якщо не вказано — без обмеження).
 * @param {number} [offset=0] - Зміщення для пагінації.
 * @returns {Promise<{ total: number, limit?: number, offset: number, results: Array<object> }>} Результат із загальною кількістю, пагінацією та масивом користувачів.
 * @throws {Error} Якщо виникла помилка під час виконання запиту.
 */
async function getAll(dbName, filters = {}, includeDeleted = false, limit, offset = 0) {
    try {
        const whereClauses = ['1=1']
        const binds = {}

        if (!includeDeleted) {
            whereClauses.push('U.DELETED_AT IS NULL')
        }

        // Динамічні фільтри
        if (filters.isActive !== undefined) {
            whereClauses.push('U.IS_ACTIVE = :isActive')
            binds.isActive = filters.isActive ? 1 : 0
        }

        if (filters.isEmailVerified !== undefined) {
            whereClauses.push('U.IS_EMAIL_VERIFIED = :isEmailVerified')
            binds.isEmailVerified = filters.isEmailVerified ? 1 : 0
        }

        if (filters.username) {
            whereClauses.push('LOWER(U.USERNAME) LIKE :username')
            binds.username = `%${filters.username.toLowerCase()}%`
        }

        if (filters.email) {
            whereClauses.push('LOWER(U.EMAIL) LIKE :email')
            binds.email = `%${filters.email.toLowerCase()}%`
        }

        if (filters.search) {
            whereClauses.push(`
          (
            LOWER(U.USERNAME) LIKE :search OR
            LOWER(U.EMAIL) LIKE :search OR
            LOWER(U.FIRST_NAME) LIKE :search OR
            LOWER(U.LAST_NAME) LIKE :search
          )
        `)
            binds.search = `%${filters.search.toLowerCase()}%`
        }

        if (filters.role) {
            whereClauses.push(`
          EXISTS (
            SELECT 1 FROM USER_ROLES ur_sub
            JOIN ROLES r_sub ON ur_sub.ROLE_ID = r_sub.ROLE_ID
            WHERE ur_sub.USER_ID = U.USER_ID
              AND r_sub.ROLE_NAME = :role
              AND ur_sub.IS_ACTIVE = 1
          )
        `)
            binds.role = filters.role
        }

        // Вибір полів
        const selectFields = [
            'U.USER_ID',
            'U.USERNAME',
            'U.EMAIL',
            'U.FIRST_NAME',
            'U.LAST_NAME',
            'U.IS_ACTIVE',
            'U.IS_EMAIL_VERIFIED',
            'U.CREATED_AT',
            'U.UPDATED_AT',
            'U.DELETED_AT',
            'U.LAST_LOGIN_AT',
        ]

        let sql = `
        SELECT
          ${selectFields.join(', ')},
          LISTAGG(R.ROLE_NAME, ',') WITHIN GROUP (ORDER BY R.ROLE_NAME) AS ROLES
        FROM USERS U
        LEFT JOIN USER_ROLES UR ON U.USER_ID = UR.USER_ID AND UR.IS_ACTIVE = 1
        LEFT JOIN ROLES R ON UR.ROLE_ID = R.ROLE_ID
        WHERE ${whereClauses.join(' AND ')}
        GROUP BY ${selectFields.join(', ')}
      `

        // Сортування
        const allowedSortFields = ['USERNAME', 'EMAIL', 'CREATED_AT', 'LAST_LOGIN_AT']
        const sortBy =
            filters.sortBy && allowedSortFields.includes(filters.sortBy.toUpperCase())
                ? filters.sortBy.toUpperCase()
                : 'USER_ID'

        const sortDirection = ['ASC', 'DESC'].includes((filters.sortDirection || '').toUpperCase())
            ? filters.sortDirection.toUpperCase()
            : 'ASC'

        sql += ` ORDER BY U.${sortBy} ${sortDirection}`

        // Пагінація (якщо limit вказано)
        if (limit !== undefined && limit !== null) {
            sql += ` OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`
        }

        const [result, countResult] = await Promise.all([
            oracleDbManager.execute(dbName, sql, binds),
            oracleDbManager.execute(
                dbName,
                `
          SELECT COUNT(DISTINCT U.USER_ID) AS TOTAL
          FROM USERS U
          LEFT JOIN USER_ROLES UR ON U.USER_ID = UR.USER_ID AND UR.IS_ACTIVE = 1
          LEFT JOIN ROLES R ON UR.ROLE_ID = R.ROLE_ID
          WHERE ${whereClauses.join(' AND ')}
        `,
                binds,
            ),
        ])

        const users = result.rows.map((user) => {
            return {
                ...user,
                ROLES: user.ROLES?.split(',') || [],
                IS_ACTIVE: user.IS_ACTIVE === 1,
                IS_EMAIL_VERIFIED: user.IS_EMAIL_VERIFIED === 1,
            }
        })

        const total = countResult.rows?.[0]?.TOTAL || 0

        return {
            total,
            limit,
            offset,
            results: users,
        }
    } catch (error) {
        logger.error(`Failed to get users: ${error.message}`, {
            error,
            filters,
            includeDeleted,
            limit,
            offset,
        })
        throw error
    }
}
