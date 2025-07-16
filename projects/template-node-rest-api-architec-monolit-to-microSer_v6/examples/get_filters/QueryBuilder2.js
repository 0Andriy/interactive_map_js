// utils/QueryBuilder.js
class QueryBuilder {
    constructor(baseFromClause, defaultColumns, searchableColumns) {
        this.baseFromClause = baseFromClause // Наприклад: `FROM USERS U LEFT JOIN USER_ROLES UR ...`
        this.defaultColumns = defaultColumns // У випадку findAll це можуть бути колонки U.USER_ID, U.USERNAME тощо
        this.searchableColumns = searchableColumns // Колонки для глобального пошуку
        this.whereConditions = []
        this.bindParams = {}
        this.paramIndex = 1
        this.paginationClause = ''
        this.orderByClause = '' // Додаємо orderByClause сюди
        this.selectColumns = [] // Для зберігання обраних колонок
    }

    /**
     * Додає умову фільтрації до запиту.
     * @param {string} column - Назва колонки (може включати префікс таблиці, наприклад 'U.IS_ACTIVE').
     * @param {any} value - Значення фільтра.
     * @param {string} [op='='] - Оператор порівняння (eq, ne, gt, gte, lt, lte, like, notlike, in, between, isnull, isnotnull).
     */
    addCondition(column, op, value) {
        const safeColumn = column.toUpperCase() // Може бути 'U.IS_ACTIVE'
        // НЕ додаємо перевірку `this.defaultColumns.includes(safeColumn)` тут,
        // бо `column` може бути з префіксом таблиці (U.IS_ACTIVE)
        // Або потрібно розширити defaultColumns для префіксів, або перевіряти в DAO

        let condition = ''
        switch (op.toLowerCase()) {
            case 'eq':
                condition = `${safeColumn} = :val${this.paramIndex}`
                this.bindParams[`val${this.paramIndex}`] = value
                break
            case 'ne':
                condition = `${safeColumn} != :val${this.paramIndex}`
                this.bindParams[`val${this.paramIndex}`] = value
                break
            case 'gt':
                condition = `${safeColumn} > :val${this.paramIndex}`
                this.bindParams[`val${this.paramIndex}`] = value
                break
            case 'gte':
                condition = `${safeColumn} >= :val${this.paramIndex}`
                this.bindParams[`val${this.paramIndex}`] = value
                break
            case 'lt':
                condition = `${safeColumn} < :val${this.paramIndex}`
                this.bindParams[`val${this.paramIndex}`] = value
                break
            case 'lte':
                condition = `${safeColumn} <= :val${this.paramIndex}`
                this.bindParams[`val${this.paramIndex}`] = value
                break
            case 'like':
                condition = `${safeColumn} LIKE :val${this.paramIndex}`
                this.bindParams[`val${this.paramIndex}`] = value
                break
            case 'notlike':
                condition = `${safeColumn} NOT LIKE :val${this.paramIndex}`
                this.bindParams[`val${this.paramIndex}`] = value
                break
            case 'in':
                if (Array.isArray(value) && value.length > 0) {
                    const inParams = value
                        .map((val, i) => {
                            this.bindParams[`val${this.paramIndex + i}`] = val
                            return `:val${this.paramIndex + i}`
                        })
                        .join(', ')
                    condition = `${safeColumn} IN (${inParams})`
                    this.paramIndex += value.length - 1 // Коригуємо індекс
                } else {
                    console.warn(
                        `Attempted 'IN' filter with empty or non-array value for column: ${column}`,
                    )
                    return // Не додаємо умову, якщо значення невірне
                }
                break
            case 'between':
                if (Array.isArray(value) && value.length === 2) {
                    condition = `${safeColumn} BETWEEN :val${this.paramIndex} AND :val${
                        this.paramIndex + 1
                    }`
                    this.bindParams[`val${this.paramIndex}`] = value[0]
                    this.bindParams[`val${this.paramIndex + 1}`] = value[1]
                    this.paramIndex += 1 // Коригуємо індекс
                } else {
                    console.warn(
                        `Attempted 'BETWEEN' filter with invalid value for column: ${column}`,
                    )
                    return // Не додаємо умову, якщо значення невірне
                }
                break
            case 'isnull':
                condition = `${safeColumn} IS NULL`
                break
            case 'isnotnull':
                condition = `${safeColumn} IS NOT NULL`
                break
            case 'raw':
                condition = value
                break // Для довільних SQL-умов, будьте обережні!
            default:
                console.warn(`Unsupported filter operator for column ${column}: ${op}`)
                return
        }
        this.whereConditions.push(condition)
        this.paramIndex++
    }

    /**
     * Додає умову глобального пошуку.
     * @param {string} searchTerm - Значення для пошуку.
     */
    addGlobalSearch(searchTerm) {
        if (searchTerm && this.searchableColumns.length > 0) {
            const searchConditions = this.searchableColumns.map((col) => {
                this.bindParams[`search_val_${this.paramIndex}`] = `%${searchTerm.toLowerCase()}%`
                return `LOWER(${col}) LIKE :search_val_${this.paramIndex++}`
            })
            this.whereConditions.push(`(${searchConditions.join(' OR ')})`)
        }
    }

    /**
     * Встановлює параметри пагінації.
     * @param {object} options - Об'єкт параметрів пагінації.
     * @param {number} [options.limit] - Ліміт записів.
     * @param {number} [options.offset=0] - Зміщення для пагінації.
     */
    setPagination(options) {
        const { limit, offset = 0 } = options

        if (limit !== undefined && limit > 0) {
            this.paginationClause = ` OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`
            this.bindParams.offset = Math.max(0, offset) // гарантуємо не від’ємний OFFSET
            this.bindParams.limit = limit
        } else if (offset > 0) {
            // Якщо limit не вказано або 0, але offset є
            this.paginationClause = ` OFFSET :offset ROWS`
            this.bindParams.offset = offset
        } else {
            this.paginationClause = '' // Немає пагінації
        }
    }

    /**
     * Встановлює ORDER BY частину запиту.
     * @param {Array<object>} sortParams - Масив об'єктів { column: string, order: 'ASC'|'DESC' }.
     */
    setOrderBy(sortParams) {
        if (!sortParams || sortParams.length === 0) {
            // Можемо мати дефолтне сортування, якщо немає, або залишити порожнім
            this.orderByClause = 'ORDER BY U.USER_ID' // Типове дефолтне для findAll
            return
        }
        this.orderByClause =
            'ORDER BY ' +
            sortParams
                .map((param) => {
                    const col = param.column.toUpperCase()
                    const ord = param.order.toUpperCase()
                    // Примітка: тут складніше перевіряти наявність колонки, якщо вона з префіксом таблиці.
                    // Допускаємо, що DAO передає валідні колонки.
                    if (!['ASC', 'DESC'].includes(ord)) {
                        throw new Error(`Invalid sort order: ${ord}`)
                    }
                    return `${col} ${ord}`
                })
                .join(', ')
    }

    /**
     * Встановлює колонки для вибірки.
     * @param {string[]} columnsArray - Масив назв колонок.
     */
    setSelectColumns(columnsArray) {
        this.selectColumns = columnsArray
    }

    /**
     * Будує основний SQL SELECT запит.
     * @returns {string} Повний SQL SELECT запит.
     */
    buildSelectQuery() {
        const selectClause =
            this.selectColumns.length > 0
                ? this.selectColumns.join(', ')
                : "U.*, LISTAGG(R.ROLE_NAME, ',') WITHIN GROUP (ORDER BY R.ROLE_NAME) AS ROLES"
        const whereString =
            this.whereConditions.length > 0 ? ` AND ${this.whereConditions.join(' AND ')}` : ''
        const groupByClause = `
      GROUP BY
        U.USER_ID, U.USERNAME, U.EMAIL, U.FIRST_NAME, U.LAST_NAME,
        U.IS_ACTIVE, U.IS_EMAIL_VERIFIED, U.CREATED_AT, U.UPDATED_AT, U.DELETED_AT, U.LAST_LOGIN_AT
    ` // Ця частина специфічна для вашого findAll

        return `
      SELECT
        ${selectClause}
      ${this.baseFromClause}
      WHERE 1=1 ${whereString}
      ${groupByClause}
      ${this.orderByClause}
      ${this.paginationClause}
    `
    }

    /**
     * Будує запит COUNT(*) для загальної кількості записів.
     * @returns {string} SQL COUNT запит.
     */
    buildCountQuery() {
        const whereString =
            this.whereConditions.length > 0 ? ` AND ${this.whereConditions.join(' AND ')}` : ''
        return `
      SELECT COUNT(DISTINCT U.USER_ID) AS TOTAL_COUNT
      ${this.baseFromClause}
      WHERE 1=1 ${whereString}
    `
    }

    /**
     * Повертає параметри прив'язки.
     * @returns {object} Об'єкт параметрів прив'язки.
     */
    getBindParams() {
        return this.bindParams
    }
}

export default QueryBuilder
