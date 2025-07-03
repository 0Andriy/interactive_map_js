import oracledb from 'oracledb'

// GET /users?page=2&limit=5&sort=name:asc,age:desc&name=John%&status=active

// Функція побудови WHERE умови та параметрів
function buildWhereClause(filters) {
    const clauses = []
    const params = {}

    Object.entries(filters).forEach(([key, value], i) => {
        if (value !== undefined && value !== null && value !== '') {
            const paramKey = `param${i}`
            if (typeof value === 'string' && value.includes('%')) {
                clauses.push(`${key} LIKE :${paramKey}`)
            } else {
                clauses.push(`${key} = :${paramKey}`)
            }
            params[paramKey] = value
        }
    })

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    return { where, params }
}

// Функція для пагінації
function buildPaginationClause(page, limit) {
    const offset = (page - 1) * limit
    return `OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`
}

// Функція побудови ORDER BY
function buildOrderByClause(sort) {
    // sort = "field1:asc,field2:desc"
    if (!sort) return ''
    const orders = sort
        .split(',')
        .map((pair) => {
            const [field, direction] = pair.split(':')
            const dir = (direction || 'asc').toUpperCase()
            if (!['ASC', 'DESC'].includes(dir)) return ''
            return `${field} ${dir}`
        })
        .filter(Boolean)
    return orders.length ? `ORDER BY ${orders.join(', ')}` : ''
}

export async function getUsers(req, res) {
    const { page = 1, limit = 10, sort, ...filters } = req.query

    // 1. Побудова фільтрів
    const { where, params } = buildWhereClause(filters)

    // 2. Побудова ORDER BY
    const orderBy = buildOrderByClause(sort)

    // 3. Побудова пагінації
    const pagination = buildPaginationClause(+page, +limit)

    // 4. Основний запит
    const sql = `
        SELECT *
        FROM users
        ${where}
        ${orderBy}
        ${pagination}
    `

    let connection

    try {
        connection = await oracledb.getConnection()

        // Виконання запиту
        const result = await connection.execute(sql, params, {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
        })

        // В ідеалі треба також вивантажити загальну кількість записів для фронту (total)
        const countSql = `
            SELECT COUNT(*) AS total
            FROM users
            ${where}
        `
        const countResult = await connection.execute(countSql, params, {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
        })

        res.json({
            page: +page,
            limit: +limit,
            total: countResult.rows[0].TOTAL,
            data: result.rows,
        })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Internal server error' })
    } finally {
        if (connection) {
            try {
                await connection.close()
            } catch (err) {
                console.error(err)
            }
        }
    }
}

// <=======================================================================================>

// GET /users?page=1&limit=10&sort=name:asc&filters={"name":{"like":"John%"}, "age":{"gte":18}}

import oracledb from 'oracledb'
import Redis from 'ioredis'
import crypto from 'crypto'
import express from 'express'

const app = express()
const redis = new Redis() // Підключення до локального Redis з дефолтними налаштуваннями

// --- Валідація пагінації ---
function validatePagination(page, limit) {
    const p = Number(page)
    const l = Number(limit)
    return {
        page: isNaN(p) || p < 1 ? 1 : p,
        limit: isNaN(l) || l < 1 || l > 100 ? 10 : l,
    }
}

// --- Валідація сортування ---
function validateSort(sort, allowedFields = []) {
    if (!sort) return ''
    const orders = sort
        .split(',')
        .map((pair) => {
            const [field, direction = 'asc'] = pair.split(':')
            if (!allowedFields.includes(field)) return ''
            const dir = direction.toUpperCase()
            if (!['ASC', 'DESC'].includes(dir)) return ''
            return `${field} ${dir}`
        })
        .filter(Boolean)
    return orders.length ? `ORDER BY ${orders.join(', ')}` : ''
}

// --- Побудова WHERE з розширеними операторами ---
function buildWhereClauseAdvanced(filters) {
    const clauses = []
    const params = {}
    let paramIndex = 0

    for (const [field, condition] of Object.entries(filters)) {
        if (typeof condition === 'object' && condition !== null) {
            for (const [op, val] of Object.entries(condition)) {
                paramIndex++
                const paramKey = `param${paramIndex}`

                switch (op) {
                    case 'eq':
                        clauses.push(`${field} = :${paramKey}`)
                        params[paramKey] = val
                        break
                    case 'like':
                        clauses.push(`${field} LIKE :${paramKey}`)
                        params[paramKey] = val
                        break
                    case 'gt':
                        clauses.push(`${field} > :${paramKey}`)
                        params[paramKey] = val
                        break
                    case 'gte':
                        clauses.push(`${field} >= :${paramKey}`)
                        params[paramKey] = val
                        break
                    case 'lt':
                        clauses.push(`${field} < :${paramKey}`)
                        params[paramKey] = val
                        break
                    case 'lte':
                        clauses.push(`${field} <= :${paramKey}`)
                        params[paramKey] = val
                        break
                    case 'in':
                        const items = val.split(',').map((item, i) => {
                            const key = `${paramKey}_${i}`
                            params[key] = item
                            return `:${key}`
                        })
                        clauses.push(`${field} IN (${items.join(', ')})`)
                        break
                    default:
                        // Ігноруємо невалідні оператори
                        break
                }
            }
        } else {
            paramIndex++
            const paramKey = `param${paramIndex}`
            clauses.push(`${field} = :${paramKey}`)
            params[paramKey] = condition
        }
    }

    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

// --- Побудова пагінації ---
function buildPaginationClause(page, limit) {
    const offset = (page - 1) * limit
    return `OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`
}

// --- Клас для побудови SQL запитів ---
class QueryBuilder {
    constructor(table) {
        this.table = table
        this.filters = {}
        this.page = 1
        this.limit = 10
        this.sort = ''
        this.allowedSortFields = []
    }

    setFilters(filters) {
        this.filters = filters
        return this
    }

    setPagination(page, limit) {
        this.page = page
        this.limit = limit
        return this
    }

    setSort(sort, allowedFields = []) {
        this.sort = sort
        this.allowedSortFields = allowedFields
        return this
    }

    build() {
        const { where, params } = buildWhereClauseAdvanced(this.filters)
        const orderBy = validateSort(this.sort, this.allowedSortFields)
        const pagination = buildPaginationClause(this.page, this.limit)

        const sql = `
            SELECT *
            FROM ${this.table}
            ${where}
            ${orderBy}
            ${pagination}
        `

        const countSql = `
            SELECT COUNT(*) AS total
            FROM ${this.table}
            ${where}
        `

        return { sql, countSql, params }
    }
}

// --- Функція для генерації хешу ключа кеша ---
function generateCacheKey(prefix, obj) {
    const hash = crypto.createHash('md5').update(JSON.stringify(obj)).digest('hex')
    return `${prefix}:${hash}`
}

// --- REST API приклад ---
app.get('/users', async (req, res) => {
    const rawFilters = req.query.filters ? JSON.parse(req.query.filters) : {}
    const { page, limit } = validatePagination(req.query.page, req.query.limit)
    const sort = req.query.sort || ''

    // Обмежуємо сортування лише дозволеними полями
    const allowedSortFields = ['name', 'age', 'status', 'created_at']

    // Створюємо будівельника запитів
    const qb = new QueryBuilder('users')
        .setFilters(rawFilters)
        .setPagination(page, limit)
        .setSort(sort, allowedSortFields)

    const { sql, countSql, params } = qb.build()

    // Генеруємо ключ кеша (по запиту і параметрах)
    const cacheKey = generateCacheKey('users', { sql, params })

    try {
        // Спроба отримати з кешу
        const cached = await redis.get(cacheKey)
        if (cached) {
            console.log('CACHE HIT')
            return res.json(JSON.parse(cached))
        }

        console.log('CACHE MISS - fetching from DB')

        const connection = await oracledb.getConnection()

        const dataResult = await connection.execute(sql, params, {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
        })
        const countResult = await connection.execute(countSql, params, {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
        })

        await connection.close()

        const response = {
            page,
            limit,
            total: countResult.rows[0].TOTAL,
            data: dataResult.rows,
        }

        // Кешуємо результат на 60 секунд
        await redis.set(cacheKey, JSON.stringify(response), 'EX', 60)

        res.json(response)
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`)
})

// <=================================== Cursor pagination ================================>
// GET /users?cursor=2023-06-01T10:00:00Z&limit=10&sort=created_at:asc

import express from 'express'
import oracledb from 'oracledb'
import Redis from 'ioredis'
import crypto from 'crypto'

// const app = express()
// const redis = new Redis()

// --- Валідації ---
function validateLimit(limit) {
    const l = Number(limit)
    if (isNaN(l) || l < 1 || l > 100) return 10
    return l
}

function validatePage(page) {
    const p = Number(page)
    return isNaN(p) || p < 1 ? 1 : p
}

function parseSort(sort) {
    if (!sort) return { field: 'created_at', direction: 'ASC' }
    const [field, dir] = sort.split(':')
    const direction = dir && dir.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'
    return { field, direction }
}

// --- Генерація кеш ключа ---
function generateCacheKey(prefix, obj) {
    const hash = crypto.createHash('md5').update(JSON.stringify(obj)).digest('hex')
    return `${prefix}:${hash}`
}

// --- Page-based пагінація ---
async function getUsersPageBased({ page, limit, sortField, sortDirection }) {
    const offset = (page - 1) * limit
    const sql = `
        SELECT *
        FROM users
        ORDER BY ${sortField} ${sortDirection}
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `
    const countSql = `SELECT COUNT(*) AS total FROM users`

    const params = { offset, limit }

    const connection = await oracledb.getConnection()

    const dataResult = await connection.execute(sql, params, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
    })
    const countResult = await connection.execute(
        countSql,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
    )

    await connection.close()

    return {
        page,
        limit,
        total: countResult.rows[0].TOTAL,
        data: dataResult.rows,
    }
}

// --- Cursor-based пагінація ---
async function getUsersCursorBased({ cursor, limit, sortField, sortDirection }) {
    let cursorCondition = ''
    const params = { limit }

    if (cursor) {
        cursorCondition =
            sortDirection === 'ASC'
                ? `WHERE ${sortField} > :cursor`
                : `WHERE ${sortField} < :cursor`
        params.cursor = cursor
    }

    const sql = `
        SELECT *
        FROM users
        ${cursorCondition}
        ORDER BY ${sortField} ${sortDirection}
        FETCH NEXT :limit ROWS ONLY
      `

    const connection = await oracledb.getConnection()

    const dataResult = await connection.execute(sql, params, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
    })

    await connection.close()

    const rows = dataResult.rows
    const nextCursor = rows.length ? rows[rows.length - 1][sortField.toUpperCase()] : null

    return {
        limit,
        nextCursor,
        data: rows,
    }
}

// --- Основний ендпоінт ---
app.get('/users', async (req, res) => {
    try {
        const limit = validateLimit(req.query.limit)
        const sort = parseSort(req.query.sort)
        const allowedSortFields = ['name', 'age', 'status', 'created_at']
        if (!allowedSortFields.includes(sort.field)) {
            return res.status(400).json({ error: `Sort by '${sort.field}' not allowed.` })
        }

        // Визначаємо спосіб пагінації: якщо є cursor — курсор, інакше page
        const useCursor = !!req.query.cursor

        // Формуємо об’єкт параметрів для кешу
        const cacheParams = {
            method: useCursor ? 'cursor' : 'page',
            limit,
            sortField: sort.field,
            sortDirection: sort.direction,
            cursor: req.query.cursor || null,
            page: useCursor ? null : validatePage(req.query.page),
        }

        const cacheKey = generateCacheKey('users', cacheParams)

        // Перевіряємо кеш
        const cached = await redis.get(cacheKey)
        if (cached) {
            console.log('CACHE HIT')
            return res.json(JSON.parse(cached))
        }

        console.log('CACHE MISS')

        let response

        if (useCursor) {
            response = await getUsersCursorBased({
                cursor: req.query.cursor,
                limit,
                sortField: sort.field,
                sortDirection: sort.direction,
            })
        } else {
            response = await getUsersPageBased({
                page: validatePage(req.query.page),
                limit,
                sortField: sort.field,
                sortDirection: sort.direction,
            })
        }

        // Записуємо в кеш на 60 секунд
        await redis.set(cacheKey, JSON.stringify(response), 'EX', 60)

        res.json(response)
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// const PORT = process.env.PORT || 3000
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

// <======================================= ======================>
// Приклад коду з мутаціями і кеш-інвалідизацією
// Як це працює?
// Після кожної мутації (POST, PUT, DELETE) викликаємо invalidateCache('users').
// Функція шукає всі ключі в Redis, що починаються з users:.
// Видаляє ці ключі, щоб кеш не відповідав застарілим даним.
// Наступний запит на /users отримає свіжі дані та занесе їх у кеш.

import express from 'express'
import oracledb from 'oracledb'
import Redis from 'ioredis'
import crypto from 'crypto'

// const app = express()
// app.use(express.json())

// const redis = new Redis()

// --- Функція для генерації кеш-ключа ---
function generateCacheKey(prefix, obj) {
    const hash = crypto.createHash('md5').update(JSON.stringify(obj)).digest('hex')
    return `${prefix}:${hash}`
}

// --- Очищення кешу по префіксу ---
async function invalidateCache(prefix) {
    const keys = await redis.keys(`${prefix}:*`)
    if (keys.length) {
        await redis.del(keys)
        console.log(`Cache invalidated for prefix: ${prefix}`)
    }
}

// --- Створення користувача ---
app.post('/users', async (req, res) => {
    const { name, age, status } = req.body

    try {
        const connection = await oracledb.getConnection()

        const sql = `INSERT INTO users (name, age, status, created_at) VALUES (:name, :age, :status, SYSDATE)`
        await connection.execute(sql, { name, age, status }, { autoCommit: true })

        await connection.close()

        // Інвалідовуємо кеш після зміни даних
        await invalidateCache('users')

        res.status(201).json({ message: 'User created' })
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Internal Server Error' })
    }
})

// --- Оновлення користувача ---
app.put('/users/:id', async (req, res) => {
    const userId = req.params.id
    const { name, age, status } = req.body

    try {
        const connection = await oracledb.getConnection()

        const sql = `
          UPDATE users
          SET name = :name, age = :age, status = :status
          WHERE id = :id
        `
        const result = await connection.execute(
            sql,
            { id: userId, name, age, status },
            { autoCommit: true },
        )

        await connection.close()

        if (result.rowsAffected === 0) {
            return res.status(404).json({ error: 'User not found' })
        }

        await invalidateCache('users')

        res.json({ message: 'User updated' })
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Internal Server Error' })
    }
})

// --- Видалення користувача ---
app.delete('/users/:id', async (req, res) => {
    const userId = req.params.id

    try {
        const connection = await oracledb.getConnection()

        const sql = `DELETE FROM users WHERE id = :id`
        const result = await connection.execute(sql, { id: userId }, { autoCommit: true })

        await connection.close()

        if (result.rowsAffected === 0) {
            return res.status(404).json({ error: 'User not found' })
        }

        await invalidateCache('users')

        res.json({ message: 'User deleted' })
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Internal Server Error' })
    }
})

// <================== покращенне кешування порівнняно з поперднім варіантом =================================>

import express from 'express'
import oracledb from 'oracledb'
import Redis from 'ioredis'
import crypto from 'crypto'

// const app = express()
// app.use(express.json())

// const redis = new Redis()

// --- Валідації ---
function validateLimit(limit) {
    const l = Number(limit)
    if (isNaN(l) || l < 1 || l > 100) return 10
    return l
}

function validatePage(page) {
    const p = Number(page)
    return isNaN(p) || p < 1 ? 1 : p
}

function parseSort(sort) {
    if (!sort) return { field: 'created_at', direction: 'ASC' }
    const [field, dir] = sort.split(':')
    const direction = dir && dir.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'
    return { field, direction }
}

// --- Генерація кеш ключа ---
function generateCacheKey(prefix, obj) {
    const hash = crypto.createHash('md5').update(JSON.stringify(obj)).digest('hex')
    return `${prefix}:${hash}`
}

// --- Додаємо кеш-ключ у множину ключів користувача userId ---
// Це потрібно, щоб знати, які кеші треба інвалідовувати при зміні користувача
async function addCacheKeyForUsers(userIds, cacheKey) {
    const pipeline = redis.pipeline()
    for (const id of userIds) {
        // Зберігаємо ключ кешу у множині user_cache_keys:<userId>
        pipeline.sadd(`user_cache_keys:${id}`, cacheKey)
        // Опційно встановлюємо TTL для індексу кеш-ключів, щоб не рости назавжди
        pipeline.expire(`user_cache_keys:${id}`, 60 * 5) // 5 хв TTL
    }
    await pipeline.exec()
}

// --- Видаляємо кеш ключі, пов'язані з конкретним користувачем ---
async function invalidateCacheForUser(userId) {
    const keys = await redis.smembers(`user_cache_keys:${userId}`)
    if (keys.length) {
        await redis.del(...keys)
        console.log(`Cache invalidated for user ${userId}, keys:`, keys)
    }
    // Чистимо індекс ключів для цього користувача
    await redis.del(`user_cache_keys:${userId}`)
}

// --- Page-based пагінація ---
async function getUsersPageBased({ page, limit, sortField, sortDirection }) {
    const offset = (page - 1) * limit
    const sql = `
        SELECT *
        FROM users
        ORDER BY ${sortField} ${sortDirection}
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `
    const countSql = `SELECT COUNT(*) AS total FROM users`

    const params = { offset, limit }

    const connection = await oracledb.getConnection()

    const dataResult = await connection.execute(sql, params, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
    })
    const countResult = await connection.execute(
        countSql,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
    )

    await connection.close()

    return {
        page,
        limit,
        total: countResult.rows[0].TOTAL,
        data: dataResult.rows,
    }
}

// --- Cursor-based пагінація ---
async function getUsersCursorBased({ cursor, limit, sortField, sortDirection }) {
    let cursorCondition = ''
    const params = { limit }

    if (cursor) {
        cursorCondition =
            sortDirection === 'ASC'
                ? `WHERE ${sortField} > :cursor`
                : `WHERE ${sortField} < :cursor`
        params.cursor = cursor
    }

    const sql = `
        SELECT *
        FROM users
        ${cursorCondition}
        ORDER BY ${sortField} ${sortDirection}
        FETCH NEXT :limit ROWS ONLY
      `

    const connection = await oracledb.getConnection()

    const dataResult = await connection.execute(sql, params, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
    })

    await connection.close()

    const rows = dataResult.rows
    const nextCursor = rows.length ? rows[rows.length - 1][sortField.toUpperCase()] : null

    return {
        limit,
        nextCursor,
        data: rows,
    }
}

// --- GET /users з кешуванням ---
app.get('/users', async (req, res) => {
    try {
        const limit = validateLimit(req.query.limit)
        const sort = parseSort(req.query.sort)
        const allowedSortFields = ['name', 'age', 'status', 'created_at']
        if (!allowedSortFields.includes(sort.field)) {
            return res.status(400).json({ error: `Sort by '${sort.field}' not allowed.` })
        }

        const useCursor = !!req.query.cursor

        const cacheParams = {
            method: useCursor ? 'cursor' : 'page',
            limit,
            sortField: sort.field,
            sortDirection: sort.direction,
            cursor: req.query.cursor || null,
            page: useCursor ? null : validatePage(req.query.page),
        }

        const cacheKey = generateCacheKey('users', cacheParams)

        // Перевіряємо кеш
        const cached = await redis.get(cacheKey)
        if (cached) {
            console.log('CACHE HIT')
            return res.json(JSON.parse(cached))
        }

        console.log('CACHE MISS')

        let response

        if (useCursor) {
            response = await getUsersCursorBased({
                cursor: req.query.cursor,
                limit,
                sortField: sort.field,
                sortDirection: sort.direction,
            })
        } else {
            response = await getUsersPageBased({
                page: validatePage(req.query.page),
                limit,
                sortField: sort.field,
                sortDirection: sort.direction,
            })
        }

        // Кешуємо результат на 60 секунд
        await redis.set(cacheKey, JSON.stringify(response), 'EX', 60)

        // Зберігаємо посилання ключа кешу на користувачів
        const userIds = response.data.map((u) => u.ID || u.id)
        await addCacheKeyForUsers(userIds, cacheKey)

        res.json(response)
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// --- POST /users - створення користувача + інвалідизація кеша ---
app.post('/users', async (req, res) => {
    const { name, age, status } = req.body

    try {
        const connection = await oracledb.getConnection()

        const sql = `INSERT INTO users (name, age, status, created_at) VALUES (:name, :age, :status, SYSDATE)`
        await connection.execute(sql, { name, age, status }, { autoCommit: true })

        await connection.close()

        // Для нового користувача кешу немає — але логічно скинути всі ключі, бо це впливає на списки
        // Якщо хочеш, можна оптимізувати з індексами або окремою логікою
        await invalidateCacheForAllUsers()

        res.status(201).json({ message: 'User created' })
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Internal Server Error' })
    }
})

// --- PUT /users/:id - оновлення користувача + інвалідизація кеша ---
app.put('/users/:id', async (req, res) => {
    const userId = req.params.id
    const { name, age, status } = req.body

    try {
        const connection = await oracledb.getConnection()

        const sql = `
          UPDATE users
          SET name = :name, age = :age, status = :status
          WHERE id = :id
        `
        const result = await connection.execute(
            sql,
            { id: userId, name, age, status },
            { autoCommit: true },
        )

        await connection.close()

        if (result.rowsAffected === 0) {
            return res.status(404).json({ error: 'User not found' })
        }

        // Інвалідовуємо кеш для конкретного користувача
        await invalidateCacheForUser(userId)

        res.json({ message: 'User updated' })
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Internal Server Error' })
    }
})

// --- DELETE /users/:id - видалення користувача + інвалідизація кеша ---
app.delete('/users/:id', async (req, res) => {
    const userId = req.params.id

    try {
        const connection = await oracledb.getConnection()

        const sql = `DELETE FROM users WHERE id = :id`
        const result = await connection.execute(sql, { id: userId }, { autoCommit: true })

        await connection.close()

        if (result.rowsAffected === 0) {
            return res.status(404).json({ error: 'User not found' })
        }

        // Інвалідовуємо кеш для конкретного користувача
        await invalidateCacheForUser(userId)

        res.json({ message: 'User deleted' })
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Internal Server Error' })
    }
})

// --- Додаткова функція для інвалідизації кешу всіх користувачів ---
// Це потрібно для POST, бо ми не знаємо id нового користувача в кеші
async function invalidateCacheForAllUsers() {
    const keys = await redis.keys('user_cache_keys:*')
    if (keys.length) {
        // Збираємо всі унікальні кеш ключі
        const pipeline = redis.pipeline()
        for (const key of keys) {
            pipeline.smembers(key)
        }
        const results = await pipeline.exec()

        const allCacheKeys = new Set()
        for (const [err, members] of results) {
            if (!err && members.length) {
                members.forEach((k) => allCacheKeys.add(k))
            }
        }

        if (allCacheKeys.size > 0) {
            await redis.del(...allCacheKeys)
            console.log('Cache invalidated for all users, keys:', Array.from(allCacheKeys))
        }
        // Чистимо всі індекси
        await redis.del(...keys)
    }
}

// const PORT = process.env.PORT || 3000
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
