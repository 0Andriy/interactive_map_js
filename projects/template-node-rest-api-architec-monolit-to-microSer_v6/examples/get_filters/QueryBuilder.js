// utils/QueryBuilder.js

class QueryBuilder {
    constructor(tableName, defaultColumns, searchableColumns) {
        this.tableName = tableName
        this.defaultColumns = defaultColumns
        this.searchableColumns = searchableColumns
        this.bindParams = {}
        this.paramIndex = 1
        this.whereConditions = []
        this.paginationClause = ''
    }

    /**
     * Додає умову фільтрації до запиту.
     * @param {string} column - Назва колонки.
     * @param {object|string|number|boolean} filterValue - Значення фільтра або об'єкт з оператором та значенням.
     */
    addFilter(column, filterValue) {
        const colName = column.toUpperCase()
        if (!this.defaultColumns.includes(colName)) {
            // Ігноруємо неіснуючі колонки або можна викинути помилку
            console.warn(`Attempted to filter on non-existent column: ${column}`)
            return
        }

        if (
            typeof filterValue === 'object' &&
            filterValue !== null &&
            filterValue.op &&
            filterValue.value !== undefined
        ) {
            switch (filterValue.op.toLowerCase()) {
                case 'eq':
                    this.whereConditions.push(`${colName} = :val${this.paramIndex}`)
                    this.bindParams[`val${this.paramIndex}`] = filterValue.value
                    this.paramIndex++
                    break
                case 'ne':
                    this.whereConditions.push(`${colName} != :val${this.paramIndex}`)
                    this.bindParams[`val${this.paramIndex}`] = filterValue.value
                    this.paramIndex++
                    break
                case 'gt':
                    this.whereConditions.push(`${colName} > :val${this.paramIndex}`)
                    this.bindParams[`val${this.paramIndex}`] = filterValue.value
                    this.paramIndex++
                    break
                case 'gte':
                    this.whereConditions.push(`${colName} >= :val${this.paramIndex}`)
                    this.bindParams[`val${this.paramIndex}`] = filterValue.value
                    this.paramIndex++
                    break
                case 'lt':
                    this.whereConditions.push(`${colName} < :val${this.paramIndex}`)
                    this.bindParams[`val${this.paramIndex}`] = filterValue.value
                    this.paramIndex++
                    break
                case 'lte':
                    this.whereConditions.push(`${colName} <= :val${this.paramIndex}`)
                    this.bindParams[`val${this.paramIndex}`] = filterValue.value
                    this.paramIndex++
                    break
                case 'like':
                    this.whereConditions.push(`${colName} LIKE :val${this.paramIndex}`)
                    this.bindParams[`val${this.paramIndex}`] = filterValue.value
                    this.paramIndex++
                    break
                case 'notlike':
                    this.whereConditions.push(`${colName} NOT LIKE :val${this.paramIndex}`)
                    this.bindParams[`val${this.paramIndex}`] = filterValue.value
                    this.paramIndex++
                    break
                case 'in':
                    if (Array.isArray(filterValue.value) && filterValue.value.length > 0) {
                        const inParams = filterValue.value
                            .map((val, i) => {
                                this.bindParams[`val${this.paramIndex + i}`] = val
                                return `:val${this.paramIndex + i}`
                            })
                            .join(', ')
                        this.whereConditions.push(`${colName} IN (${inParams})`)
                        this.paramIndex += filterValue.value.length
                    }
                    break
                case 'between':
                    if (Array.isArray(filterValue.value) && filterValue.value.length === 2) {
                        this.whereConditions.push(
                            `${colName} BETWEEN :val${this.paramIndex} AND :val${
                                this.paramIndex + 1
                            }`,
                        )
                        this.bindParams[`val${this.paramIndex}`] = filterValue.value[0]
                        this.bindParams[`val${this.paramIndex + 1}`] = filterValue.value[1]
                        this.paramIndex += 2
                    }
                    break
                case 'isnull':
                    this.whereConditions.push(`${colName} IS NULL`)
                    break
                case 'isnotnull':
                    this.whereConditions.push(`${colName} IS NOT NULL`)
                    break
                default:
                    console.warn(
                        `Unsupported filter operator for column ${colName}: ${filterValue.op}`,
                    )
                    break
            }
        } else {
            if (typeof filterValue === 'string' && filterValue.includes('%')) {
                this.whereConditions.push(`${colName} LIKE :val${this.paramIndex}`)
            } else {
                this.whereConditions.push(`${colName} = :val${this.paramIndex}`)
            }
            this.bindParams[`val${this.paramIndex}`] = filterValue
            this.paramIndex++
        }
    }

    /**
     * Додає умову глобального пошуку.
     * @param {string} searchTerm - Значення для пошуку.
     */
    addGlobalSearch(searchTerm) {
        if (searchTerm && this.searchableColumns.length > 0) {
            const searchConditions = this.searchableColumns.map((col) => {
                this.bindParams[`search_val_${this.paramIndex}`] = `%${searchTerm}%`
                return `${col} LIKE :search_val_${this.paramIndex++}`
            })
            this.whereConditions.push(`(${searchConditions.join(' OR ')})`)
        }
    }

    /**
     * Встановлює параметри пагінації.
     * @param {object} options - Об'єкт параметрів пагінації.
     * @param {number} options.limit - Ліміт записів.
     * @param {number} [options.page] - Номер сторінки для offset-based пагінації.
     * @param {any} [options.lastId] - Курсор для keyset-based пагінації.
     * @param {string} [options.primarySortColumnForCursor] - Колонка для курсора.
     * @param {string} [options.primarySortOrderForCursor] - Порядок для курсора.
     */
    setPagination(options) {
        const { limit, page, lastId, primarySortColumnForCursor, primarySortOrderForCursor } =
            options

        if (limit === 0) {
            this.paginationClause = ''
        } else if (lastId !== undefined) {
            // Курсорна пагінація
            const cursorOperator = primarySortOrderForCursor === 'ASC' ? '>' : '<'
            this.whereConditions.push(`${primarySortColumnForCursor} ${cursorOperator} :lastId`)
            this.bindParams.lastId = lastId
            this.paginationClause = `FETCH NEXT :limit ROWS ONLY`
        } else {
            // Offset пагінація
            const offset = (page - 1) * limit
            this.bindParams.offset = offset
            this.paginationClause = `OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`
        }

        if (limit > 0) {
            this.bindParams.limit = limit
        }
    }

    /**
     * Будує ORDER BY частину запиту.
     * @param {Array<object>} sortParams - Масив об'єктів { column: string, order: 'ASC'|'DESC' }.
     * @returns {string} Сформована ORDER BY частина.
     */
    buildOrderByClause(sortParams) {
        if (!sortParams || sortParams.length === 0) {
            sortParams = [{ column: 'ID', order: 'ASC' }] // Дефолтне сортування
        }
        return sortParams
            .map((param) => {
                const col = param.column.toUpperCase()
                const ord = param.order.toUpperCase()
                if (!this.defaultColumns.includes(col) || !['ASC', 'DESC'].includes(ord)) {
                    throw new Error(`Invalid sort column or order: ${param.column}:${param.order}`)
                }
                return `${col} ${ord}`
            })
            .join(', ')
    }

    /**
     * Будує основний SQL запит SELECT.
     * @param {string[]} selectedColumns - Масив вибраних колонок.
     * @param {boolean} includeCursorKey - Чи включати CURSOR_KEY для курсорної пагінації.
     * @param {string} cursorKeyColumn - Колонка, яка буде CURSOR_KEY.
     * @returns {string} Повний SQL SELECT запит.
     */
    buildSelectQuery(selectedColumns, includeCursorKey, cursorKeyColumn, orderByClauses) {
        const selectColumnsString = selectedColumns.join(', ')
        const cursorKeySelect = includeCursorKey ? `, ${cursorKeyColumn} AS CURSOR_KEY` : ''
        const whereClause =
            this.whereConditions.length > 0 ? `WHERE ${this.whereConditions.join(' AND ')}` : ''

        return `
      SELECT ${selectColumnsString}${cursorKeySelect}
      FROM ${this.tableName}
      ${whereClause}
      ORDER BY ${orderByClauses}
      ${this.paginationClause}
    `
    }

    /**
     * Будує запит COUNT(*) для загальної кількості записів.
     * @returns {string} SQL COUNT запит.
     */
    buildCountQuery() {
        const whereClause =
            this.whereConditions.length > 0 ? `WHERE ${this.whereConditions.join(' AND ')}` : ''
        return `
      SELECT COUNT(*) AS total
      FROM ${this.tableName}
      ${whereClause}
    `
    }

    /**
     * Повертає параметри прив'язки.
     * @returns {object} Об'єкт параметрів прив'язки.
     */
    getBindParams() {
        return this.bindParams
    }

    /**
     * Повертає параметри прив'язки без пагінаційних (для COUNT запиту).
     * @returns {object} Об'єкт параметрів прив'язки.
     */
    getBindParamsForCount() {
        const countBindParams = {}
        for (const key in this.bindParams) {
            if (!['offset', 'limit', 'lastId'].includes(key)) {
                countBindParams[key] = this.bindParams[key]
            }
        }
        return countBindParams
    }
}

export default QueryBuilder
