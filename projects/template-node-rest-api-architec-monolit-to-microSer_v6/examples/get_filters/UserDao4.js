// models/UserDao.js
import oracledb from 'oracledb'
import { getConnection } from '../db.js'

class UserDao {
    constructor() {
        this.tableName = 'USERS'
        this.defaultColumns = ['ID', 'NAME', 'EMAIL', 'CREATED_AT', 'AGE']
        this.searchableColumns = ['NAME', 'EMAIL'] // Колонки, по яких можна шукати
    }

    /**
     * Отримує користувачів з можливістю пагінації (offset або курсорної),
     * розширеної фільтрації, сортування за кількома колонками та глобального пошуку.
     *
     * @param {object} options - Об'єкт параметрів.
     * @param {number} [options.page=1] - Номер сторінки (для offset-based).
     * @param {number|string} [options.lastId] - ID останнього елемента попередньої сторінки (для keyset-based).
     * Якщо вказано, має пріоритет над `page`.
     * @param {number} [options.limit=10] - Кількість записів на сторінці. Якщо 0, повертає всі рядки.
     * @param {object} [options.filters={}] - Об'єкт для фільтрації.
     * @param {Array<object>} [options.sortParams] - Масив об'єктів { column: string, order: 'ASC'|'DESC' } для сортування.
     * @param {string[]} [options.columns=[]] - Масив колонок для вибірки.
     * @param {string} [options.search] - Рядок для глобального пошуку по `searchableColumns`.
     * @returns {Promise<object>} Об'єкт з даними користувачів та метаінформацією (пагінація, наступний курсор).
     */
    async find(options = {}) {
        let connection
        try {
            const {
                page = 1,
                lastId,
                limit = 10,
                filters = {},
                sortParams = [{ column: 'ID', order: 'ASC' }], // Масив для сортування
                columns = [],
                search,
            } = options

            connection = await getConnection()

            // Формування ORDER BY частини
            const orderByClauses = sortParams
                .map((param) => {
                    const col = param.column.toUpperCase()
                    const ord = param.order.toUpperCase()
                    // Захист від SQL-ін'єкцій, перевіряючи, чи колонка є допустимою
                    if (!this.defaultColumns.includes(col) || !['ASC', 'DESC'].includes(ord)) {
                        throw new Error(
                            `Invalid sort column or order: ${param.column}:${param.order}`,
                        )
                    }
                    return `${col} ${ord}`
                })
                .join(', ')

            // Для курсорної пагінації використовуємо лише ПЕРШУ колонку з sortParams
            // (Це спрощення, повноцінна keyset-пагінація по кількох колонках складніша)
            const primarySortColumnForCursor =
                sortParams.length > 0 ? sortParams[0].column.toUpperCase() : 'ID'
            const primarySortOrderForCursor =
                sortParams.length > 0 ? sortParams[0].order.toUpperCase() : 'ASC'

            let filterConditions = []
            let bindParams = {}
            let paramIndex = 1

            // Обробка розширених фільтрів
            for (const key in filters) {
                if (
                    Object.prototype.hasOwnProperty.call(filters, key) &&
                    this.defaultColumns.includes(key.toUpperCase())
                ) {
                    const colName = key.toUpperCase()
                    const filterValue = filters[key]

                    if (
                        typeof filterValue === 'object' &&
                        filterValue !== null &&
                        filterValue.op &&
                        filterValue.value !== undefined
                    ) {
                        switch (filterValue.op.toLowerCase()) {
                            case 'eq':
                                filterConditions.push(`${colName} = :val${paramIndex}`)
                                bindParams[`val${paramIndex}`] = filterValue.value
                                paramIndex++
                                break
                            case 'ne':
                                filterConditions.push(`${colName} != :val${paramIndex}`)
                                bindParams[`val${paramIndex}`] = filterValue.value
                                paramIndex++
                                break
                            case 'gt':
                                filterConditions.push(`${colName} > :val${paramIndex}`)
                                bindParams[`val${paramIndex}`] = filterValue.value
                                paramIndex++
                                break
                            case 'gte':
                                filterConditions.push(`${colName} >= :val${paramIndex}`)
                                bindParams[`val${paramIndex}`] = filterValue.value
                                paramIndex++
                                break
                            case 'lt':
                                filterConditions.push(`${colName} < :val${paramIndex}`)
                                bindParams[`val${paramIndex}`] = filterValue.value
                                paramIndex++
                                break
                            case 'lte':
                                filterConditions.push(`${colName} <= :val${paramIndex}`)
                                bindParams[`val${paramIndex}`] = filterValue.value
                                paramIndex++
                                break
                            case 'like':
                                filterConditions.push(`${colName} LIKE :val${paramIndex}`)
                                bindParams[`val${paramIndex}`] = filterValue.value
                                paramIndex++
                                break
                            case 'notlike':
                                filterConditions.push(`${colName} NOT LIKE :val${paramIndex}`)
                                bindParams[`val${paramIndex}`] = filterValue.value
                                paramIndex++
                                break
                            case 'in':
                                if (
                                    Array.isArray(filterValue.value) &&
                                    filterValue.value.length > 0
                                ) {
                                    const inParams = filterValue.value
                                        .map((val, i) => {
                                            bindParams[`val${paramIndex + i}`] = val
                                            return `:val${paramIndex + i}`
                                        })
                                        .join(', ')
                                    filterConditions.push(`${colName} IN (${inParams})`)
                                    paramIndex += filterValue.value.length
                                }
                                break
                            case 'between':
                                if (
                                    Array.isArray(filterValue.value) &&
                                    filterValue.value.length === 2
                                ) {
                                    filterConditions.push(
                                        `${colName} BETWEEN :val${paramIndex} AND :val${
                                            paramIndex + 1
                                        }`,
                                    )
                                    bindParams[`val${paramIndex}`] = filterValue.value[0]
                                    bindParams[`val${paramIndex + 1}`] = filterValue.value[1]
                                    paramIndex += 2
                                }
                                break
                            case 'isnull':
                                filterConditions.push(`${colName} IS NULL`)
                                break
                            case 'isnotnull':
                                filterConditions.push(`${colName} IS NOT NULL`)
                                break
                            default:
                                console.warn(
                                    `Unsupported filter operator for column ${colName}: ${filterValue.op}`,
                                )
                                break
                        }
                    } else {
                        if (typeof filterValue === 'string' && filterValue.includes('%')) {
                            filterConditions.push(`${colName} LIKE :val${paramIndex}`)
                        } else {
                            filterConditions.push(`${colName} = :val${paramIndex}`)
                        }
                        bindParams[`val${paramIndex}`] = filterValue
                        paramIndex++
                    }
                }
            }

            // Додаємо глобальний пошук
            if (search && this.searchableColumns.length > 0) {
                const searchConditions = this.searchableColumns.map((col) => {
                    bindParams[`search_val_${paramIndex}`] = `%${search}%`
                    return `${col} LIKE :search_val_${paramIndex++}`
                })
                filterConditions.push(`(${searchConditions.join(' OR ')})`)
            }

            let paginationClause = ''
            let cursorInfo = null // Для курсорної пагінації
            let offsetInfo = null // Для offset пагінації

            const allConditions = [...filterConditions]

            // Визначаємо тип пагінації або відсутність обмеження
            if (limit === 0) {
                // Якщо limit = 0, не додаємо FETCH/OFFSET
                paginationClause = ''
            } else if (lastId !== undefined) {
                // Курсорна пагінація
                let cursorOperator = primarySortOrderForCursor === 'ASC' ? '>' : '<'

                allConditions.push(`${primarySortColumnForCursor} ${cursorOperator} :lastId`)
                bindParams.lastId = lastId

                paginationClause = `FETCH NEXT :limit ROWS ONLY`
            } else {
                // Offset пагінація
                const offset = (page - 1) * limit
                paginationClause = `OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`
                bindParams.offset = offset
            }

            // Додаємо limit до bindParams, якщо він > 0, для FETCH NEXT
            if (limit > 0) {
                bindParams.limit = limit
            }

            const whereClause =
                allConditions.length > 0 ? `WHERE ${allConditions.join(' AND ')}` : ''

            // Формуємо SELECT частину, додаючи CURSOR_KEY лише якщо це курсорна пагінація і limit > 0
            const selectColumnsClause = `${selectedColumns} ${
                lastId !== undefined && limit > 0
                    ? `, ${primarySortColumnForCursor} AS CURSOR_KEY`
                    : ''
            }`

            // Виконання основного запиту
            const query = `
        SELECT ${selectColumnsClause}
        FROM ${this.tableName}
        ${whereClause}
        ORDER BY ${orderByClauses}
        ${paginationClause}
      `

            const result = await connection.execute(query, bindParams, {
                outFormat: oracledb.OUT_FORMAT_OBJECT,
            })
            const data = result.rows

            // Визначення метаданих пагінації
            if (limit === 0) {
                // Якщо limit = 0, повертаємо загальну кількість без пагінації
                const countQuery = `
            SELECT COUNT(*) AS total
            FROM ${this.tableName}
            ${whereClause}
          `
                const countBindParams = {} // Копіюємо лише фільтри та пошук
                for (const key in bindParams) {
                    if (!['offset', 'limit', 'lastId'].includes(key)) {
                        countBindParams[key] = bindParams[key]
                    }
                }
                const countResult = await connection.execute(countQuery, countBindParams, {
                    outFormat: oracledb.OUT_FORMAT_OBJECT,
                })
                const total = countResult.rows[0].TOTAL
                offsetInfo = {
                    page: 1, // Логічно встановити 1, оскільки немає "сторінок"
                    limit: total, // Ліміт дорівнює загальній кількості
                    total: total,
                    totalPages: 1,
                }
            } else if (lastId !== undefined) {
                // Курсорна пагінація
                let nextCursor = null
                if (data.length === limit) {
                    nextCursor = data[data.length - 1].CURSOR_KEY
                }
                cursorInfo = {
                    limit: Number(limit),
                    nextCursor: nextCursor,
                }
            } else {
                // Offset пагінація
                const countQuery = `
          SELECT COUNT(*) AS total
          FROM ${this.tableName}
          ${whereClause}
        `
                const countBindParams = {}
                for (const key in bindParams) {
                    if (!['offset', 'limit', 'lastId'].includes(key)) {
                        countBindParams[key] = bindParams[key]
                    }
                }

                const countResult = await connection.execute(countQuery, countBindParams, {
                    outFormat: oracledb.OUT_FORMAT_OBJECT,
                })
                const total = countResult.rows[0].TOTAL
                offsetInfo = {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    totalPages: Math.ceil(total / limit),
                }
            }

            return {
                data,
                pagination: cursorInfo || offsetInfo,
            }
        } catch (err) {
            console.error('Error in UserDao.find:', err)
            throw err
        } finally {
            if (connection) {
                try {
                    await connection.close()
                } catch (err) {
                    console.error('Error closing connection in UserDao.find:', err)
                }
            }
        }
    }

    // Метод findById залишається без змін
    async findById(id, columns = []) {
        let connection
        try {
            connection = await getConnection()
            const selectedColumns =
                columns.length > 0
                    ? columns
                          .filter((col) => this.defaultColumns.includes(col.toUpperCase()))
                          .map((col) => col.toUpperCase())
                          .join(', ')
                    : this.defaultColumns.join(', ')
            const query = `SELECT ${selectedColumns} FROM ${this.tableName} WHERE ID = :id`
            const result = await connection.execute(
                query,
                { id },
                { outFormat: oracledb.OUT_FORMAT_OBJECT },
            )
            return result.rows[0]
        } catch (err) {
            console.error('Error in UserDao.findById:', err)
            throw err
        } finally {
            if (connection) {
                try {
                    await connection.close()
                } catch (err) {
                    console.error('Error closing connection in UserDao.findById:', err)
                }
            }
        }
    }
}

export default new UserDao()



// Зрозумів! Ось приклад запиту, який демонструє сортування за декількома колонками, глобальний пошук та пагінацію, з короткими поясненнями.
// Припустимо, ваш API працює за адресою http://localhost:3000/api/users.

// Приклад Комплексного Запиту
// Цей запит отримає користувачів, які:
// Містять у своєму імені або електронній пошті слово "admin".
// Мають вік більший за 25 років.
// Будуть відсортовані спочатку за іменем у зростаючому порядку, а потім за віком у спадному порядку.
// Повернуться записи з першої сторінки, по 5 записів на сторінку.
// Будуть вибрані лише колонки ID, NAME та EMAIL.
// Bash
// curl "http://localhost:3000/api/users?search=admin&age[op]=gt&age[value]=25&sort=NAME:asc,AGE:desc&limit=5&page=1&columns=ID,NAME,EMAIL"
