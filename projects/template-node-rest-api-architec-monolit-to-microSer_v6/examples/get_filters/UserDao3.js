// models/UserDao.js
import oracledb from 'oracledb'
import { getConnection } from '../db.js'

class UserDao {
    constructor() {
        this.tableName = 'USERS' // Ваша таблиця
        this.defaultColumns = ['ID', 'NAME', 'EMAIL', 'CREATED_AT', 'AGE']
        // Визначимо, які колонки є текстовими для глобального пошуку
        this.searchableColumns = ['NAME', 'EMAIL'] // Колонки, по яких можна шукати
    }

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
                search, // Новий параметр для глобального пошуку
            } = options

            const offset = (page - 1) * limit

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

            // Обробка розширених фільтрів (як було раніше)
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
                        // Просте співпадіння або LIKE
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
                    bindParams[`search_val_${paramIndex}`] = `%${search}%` // Обгортаємо значення у '%' для LIKE
                    return `${col} LIKE :search_val_${paramIndex++}`
                })
                filterConditions.push(`(${searchConditions.join(' OR ')})`) // Пошук ІБО в одній з колонок
            }

            const whereClause =
                filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : ''

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

            const countQuery = `
        SELECT COUNT(*) AS total
        FROM ${this.tableName}
        ${whereClause}
      `
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
