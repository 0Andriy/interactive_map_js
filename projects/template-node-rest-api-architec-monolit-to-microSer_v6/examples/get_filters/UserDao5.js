// models/UserDao.js
import oracledb from 'oracledb'
import { getConnection } from '../db.js'
import QueryBuilder from '../utils/QueryBuilder.js' // Імпортуємо QueryBuilder

class UserDao {
    constructor() {
        this.tableName = 'USERS'
        this.defaultColumns = ['ID', 'NAME', 'EMAIL', 'CREATED_AT', 'AGE']
        this.searchableColumns = ['NAME', 'EMAIL']
    }

    async find(options = {}) {
        let connection
        try {
            const {
                page = 1,
                lastId,
                limit = 10,
                filters = {},
                sortParams = [{ column: 'ID', order: 'ASC' }],
                columns = [],
                search,
            } = options

            connection = await getConnection()

            // Створюємо екземпляр QueryBuilder
            const queryBuilder = new QueryBuilder(
                this.tableName,
                this.defaultColumns,
                this.searchableColumns,
            )

            // Додаємо фільтри
            for (const key in filters) {
                if (Object.prototype.hasOwnProperty.call(filters, key)) {
                    // Перевірка на defaultColumns вже всередині QueryBuilder
                    queryBuilder.addFilter(key, filters[key])
                }
            }

            // Додаємо глобальний пошук
            queryBuilder.addGlobalSearch(search)

            // Визначаємо колонку та порядок для курсора (перша в sortParams)
            const primarySortColumnForCursor =
                sortParams.length > 0 ? sortParams[0].column.toUpperCase() : 'ID'
            const primarySortOrderForCursor =
                sortParams.length > 0 ? sortParams[0].order.toUpperCase() : 'ASC'

            // Встановлюємо параметри пагінації
            queryBuilder.setPagination({
                limit,
                page,
                lastId,
                primarySortColumnForCursor,
                primarySortOrderForCursor,
            })

            // Будуємо ORDER BY частину
            const orderByClauses = queryBuilder.buildOrderByClause(sortParams)

            const selectedColumnsString =
                columns.length > 0
                    ? columns
                          .filter((col) => this.defaultColumns.includes(col.toUpperCase()))
                          .map((col) => col.toUpperCase())
                    : this.defaultColumns

            // Визначаємо, чи потрібно включати CURSOR_KEY
            const includeCursorKey = lastId !== undefined && limit > 0

            // Будуємо основний запит
            const query = queryBuilder.buildSelectQuery(
                selectedColumnsString,
                includeCursorKey,
                primarySortColumnForCursor,
                orderByClauses,
            )

            const bindParams = queryBuilder.getBindParams()

            const result = await connection.execute(query, bindParams, {
                outFormat: oracledb.OUT_FORMAT_OBJECT,
            })
            const data = result.rows

            // Визначення метаданих пагінації
            let paginationInfo
            if (limit === 0) {
                const countQuery = queryBuilder.buildCountQuery()
                const countBindParams = queryBuilder.getBindParamsForCount()
                const countResult = await connection.execute(countQuery, countBindParams, {
                    outFormat: oracledb.OUT_FORMAT_OBJECT,
                })
                const total = countResult.rows[0].TOTAL
                paginationInfo = {
                    page: 1,
                    limit: total,
                    total: total,
                    totalPages: 1,
                }
            } else if (lastId !== undefined) {
                let nextCursor = null
                if (data.length === limit) {
                    nextCursor = data[data.length - 1].CURSOR_KEY
                }
                paginationInfo = {
                    limit: Number(limit),
                    nextCursor: nextCursor,
                }
            } else {
                const countQuery = queryBuilder.buildCountQuery()
                const countBindParams = queryBuilder.getBindParamsForCount()
                const countResult = await connection.execute(countQuery, countBindParams, {
                    outFormat: oracledb.OUT_FORMAT_OBJECT,
                })
                const total = countResult.rows[0].TOTAL
                paginationInfo = {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    totalPages: Math.ceil(total / limit),
                }
            }

            return {
                data,
                pagination: paginationInfo,
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
