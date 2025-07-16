// models/UserDao.js
import { getConnection } from '../db.js'

class UserDao {
    constructor() {
        this.tableName = 'USERS' // Ваша таблиця
        this.defaultColumns = ['ID', 'NAME', 'EMAIL', 'CREATED_AT'] // Колонки за замовчуванням
    }

    /**
     * Отримує користувачів з можливістю пагінації, фільтрації та сортування.
     * @param {object} options - Об'єкт параметрів.
     * @param {number} [options.page=1] - Номер сторінки.
     * @param {number} [options.limit=10] - Кількість записів на сторінці.
     * @param {object} [options.filters={}] - Об'єкт для фільтрації (e.g., { name: 'John', email: '%@example.com' }).
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
                    const filterValue = filters[key]
                    if (typeof filterValue === 'string' && filterValue.includes('%')) {
                        // Використовуємо LIKE для пошуку за шаблоном
                        filterConditions.push(`${key.toUpperCase()} LIKE :val${paramIndex}`)
                    } else {
                        // Точне співпадіння
                        filterConditions.push(`${key.toUpperCase()} = :val${paramIndex}`)
                    }
                    bindParams[`val${paramIndex}`] = filterValue
                    paramIndex++
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

    // Додайте інші методи за необхідності (findById, create, update, delete)
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
