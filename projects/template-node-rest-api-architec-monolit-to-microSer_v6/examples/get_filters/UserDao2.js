// models/UserDao.js
import oracledb from 'oracledb'
import { getConnection } from '../db.js'

class UserDao {
    constructor() {
        this.tableName = 'USERS' // Ваша таблиця
        this.defaultColumns = ['ID', 'NAME', 'EMAIL', 'CREATED_AT', 'AGE'] // Додамо AGE для прикладу числової фільтрації
        // Додайте інші колонки, якщо вони є у вашій таблиці
    }

    /**
     * Отримує користувачів з можливістю пагінації, розширеної фільтрації та сортування.
     * @param {object} options - Об'єкт параметрів.
     * @param {number} [options.page=1] - Номер сторінки.
     * @param {number} [options.limit=10] - Кількість записів на сторінці.
     * @param {object} [options.filters={}] - Об'єкт для фільтрації. Ключ: ім'я колонки, Значення: об'єкт { op: 'оператор', value: 'значення' } або просто 'значення' для точного збігу/LIKE.
     * Приклади:
     * { name: 'John%', age: { op: 'gt', value: 30 }, createdAt: { op: 'between', value: ['2023-01-01', '2023-12-31'] } }
     * @param {string} [options.sortBy='ID'] - Колонка для сортування.
     * @param {string} [options.sortOrder='ASC'] - Порядок сортування ('ASC' або 'DESC').
     * @param {string[]} [options.columns=[]] - Масив колонок для вибірки. Якщо порожній, використовуються defaultColumns.
     * @returns {Promise<object>} Об'єкт з даними користувачів та метаінформацією.
     */
    async find(options = {}) {
        let connection
        try {
            connection = await getConnection()

            const {
                page = 1,
                limit = 10,
                filters = {},
                sortBy = 'ID',
                sortOrder = 'ASC',
                columns = [],
            } = options

            const offset = (page - 1) * limit

            // Валідація сортування та колонок
            const validSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase())
                ? sortOrder.toUpperCase()
                : 'ASC'
            const selectedColumns =
                columns.length > 0
                    ? columns
                          .filter((col) => this.defaultColumns.includes(col.toUpperCase()))
                          .map((col) => col.toUpperCase())
                          .join(', ')
                    : this.defaultColumns.join(', ')
            const validSortBy = this.defaultColumns.includes(sortBy.toUpperCase())
                ? sortBy.toUpperCase()
                : 'ID'

            let filterConditions = []
            let bindParams = {}
            let paramIndex = 1

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
                        // Розширена фільтрація з оператором
                        switch (filterValue.op.toLowerCase()) {
                            case 'eq': // Equal
                                filterConditions.push(`${colName} = :val${paramIndex}`)
                                bindParams[`val${paramIndex}`] = filterValue.value
                                paramIndex++
                                break
                            case 'ne': // Not Equal
                                filterConditions.push(`${colName} != :val${paramIndex}`)
                                bindParams[`val${paramIndex}`] = filterValue.value
                                paramIndex++
                                break
                            case 'gt': // Greater Than
                                filterConditions.push(`${colName} > :val${paramIndex}`)
                                bindParams[`val${paramIndex}`] = filterValue.value
                                paramIndex++
                                break
                            case 'gte': // Greater Than or Equal
                                filterConditions.push(`${colName} >= :val${paramIndex}`)
                                bindParams[`val${paramIndex}`] = filterValue.value
                                paramIndex++
                                break
                            case 'lt': // Less Than
                                filterConditions.push(`${colName} < :val${paramIndex}`)
                                bindParams[`val${paramIndex}`] = filterValue.value
                                paramIndex++
                                break
                            case 'lte': // Less Than or Equal
                                filterConditions.push(`${colName} <= :val${paramIndex}`)
                                bindParams[`val${paramIndex}`] = filterValue.value
                                paramIndex++
                                break
                            case 'like': // LIKE operator
                                filterConditions.push(`${colName} LIKE :val${paramIndex}`)
                                bindParams[`val${paramIndex}`] = filterValue.value
                                paramIndex++
                                break
                            case 'notlike': // NOT LIKE operator
                                filterConditions.push(`${colName} NOT LIKE :val${paramIndex}`)
                                bindParams[`val${paramIndex}`] = filterValue.value
                                paramIndex++
                                break
                            case 'in': // IN operator (expects array)
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
                            case 'between': // BETWEEN operator (expects array of two values)
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
                            // Додайте інші оператори за необхідності (IS NULL, IS NOT NULL)
                            case 'isnull':
                                filterConditions.push(`${colName} IS NULL`)
                                break
                            case 'isnotnull':
                                filterConditions.push(`${colName} IS NOT NULL`)
                                break
                            default:
                                // Якщо оператор не розпізнано, ігноруємо або викидаємо помилку
                                console.warn(
                                    `Unsupported filter operator for column ${colName}: ${filterValue.op}`,
                                )
                                break
                        }
                    } else {
                        // Фільтрація за точним співпадінням або LIKE (як раніше)
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

            const whereClause =
                filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : ''

            // Запит для отримання даних
            const query = `
        SELECT ${selectedColumns}
        FROM ${this.tableName}
        ${whereClause}
        ORDER BY ${validSortBy} ${validSortOrder}
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `

            bindParams.offset = offset
            bindParams.limit = limit

            const result = await connection.execute(query, bindParams, {
                outFormat: oracledb.OUT_FORMAT_OBJECT,
            })
            const data = result.rows

            // Запит для отримання загальної кількості записів (для пагінації)
            const countQuery = `
        SELECT COUNT(*) AS total
        FROM ${this.tableName}
        ${whereClause}
      `
            // Для запиту COUNT(*) також потрібно передати ті ж самі параметри прив'язки
            const countResult = await connection.execute(countQuery, bindParams, {
                outFormat: oracledb.OUT_FORMAT_OBJECT,
            })
            const total = countResult.rows[0].TOTAL

            return {
                data,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    totalPages: Math.ceil(total / limit),
                },
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
