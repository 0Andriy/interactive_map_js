// routes/users.js
import express from 'express'
import Joi from 'joi'
import UserDao from '../models/UserDao.js'

const router = express.Router()

const filterValueSchema = Joi.alternatives()
    .try
    // ... (без змін) ...
    ()

// Схема валідації для GET /users
const getUsersSchema = Joi.object({
    limit: Joi.number().integer().min(0).max(100).default(10),
    // Змінюємо sortBy та sortOrder на єдиний параметр sort, який буде парситися
    sort: Joi.string()
        .pattern(/^([a-zA-Z_]+(:asc|:desc)?)(,[a-zA-Z_]+(:asc|:desc)?)*$/)
        .allow(''),
    columns: Joi.string()
        .pattern(/^[a-zA-Z, ]+$/)
        .allow(''),
    search: Joi.string().min(1).max(255).allow(''),

    page: Joi.number().integer().min(1).default(1),
    lastId: Joi.alternatives().try(Joi.number().integer(), Joi.string().isoDate()),

    name: filterValueSchema,
    email: filterValueSchema,
    age: filterValueSchema,
    createdAt: filterValueSchema,
})

router.get('/', async (req, res, next) => {
    try {
        const { error, value } = getUsersSchema.validate(req.query, {
            abortEarly: false,
            stripUnknown: true,
        })

        if (error) {
            return res.status(400).json({
                message: 'Invalid query parameters',
                details: error.details.map((d) => d.message),
            })
        }

        const { page, limit, columns, search, lastId, sort } = value // Тепер отримуємо 'sort'

        const filters = {}
        for (const key in value) {
            if (UserDao.defaultColumns.includes(key.toUpperCase()) && value[key] !== undefined) {
                filters[key] = value[key]
            }
        }

        const requestedColumns = columns
            ? columns.split(',').map((col) => col.trim().toUpperCase())
            : []

        // Парсинг параметра 'sort'
        const sortParams = []
        if (sort) {
            sort.split(',').forEach((sortItem) => {
                const parts = sortItem.split(':')
                const column = parts[0].trim().toUpperCase()
                const order = parts[1] ? parts[1].trim().toUpperCase() : 'ASC' // За замовчуванням ASC

                // Перевіряємо, чи колонка є допустимою для сортування
                if (UserDao.defaultColumns.includes(column) && ['ASC', 'DESC'].includes(order)) {
                    sortParams.push({ column, order })
                }
            })
        }
        // Якщо sortParams порожній, додаємо сортування за замовчуванням
        if (sortParams.length === 0) {
            sortParams.push({ column: 'ID', order: 'ASC' })
        }

        const users = await UserDao.find({
            page,
            lastId,
            limit,
            sortParams, // Передаємо розпарсені параметри сортування
            filters,
            columns: requestedColumns,
            search,
        })

        res.json(users)
    } catch (err) {
        next(err)
    }
})

// ... (маршрут router.get('/:id') без змін) ...

export default router
