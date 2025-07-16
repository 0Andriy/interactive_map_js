// routes/users.js
import express from 'express'
import Joi from 'joi'
import UserDao from '../models/UserDao.js'

const router = express.Router()

// Допоміжна функція для створення схеми фільтрації з операторами
const filterValueSchema = Joi.alternatives().try(
    Joi.string(), // Для простого точного збігу або LIKE
    Joi.object({
        op: Joi.string()
            .valid(
                'eq',
                'ne',
                'gt',
                'gte',
                'lt',
                'lte',
                'like',
                'notlike',
                'in',
                'between',
                'isnull',
                'isnotnull',
            )
            .required(),
        value: Joi.alternatives()
            .try(
                Joi.string(),
                Joi.number(),
                Joi.boolean(),
                Joi.array().items(Joi.string(), Joi.number()).min(1).max(2), // Для 'in' та 'between'
            )
            .when('op', {
                is: Joi.string().valid('isnull', 'isnotnull'),
                then: Joi.forbidden(), // 'isnull'/'isnotnull' не потребують значення
                otherwise: Joi.required(),
            }),
    }),
)

// Схема валідації для GET /users
const getUsersSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().valid('ID', 'NAME', 'EMAIL', 'CREATED_AT', 'AGE').default('ID'), // Додайте 'AGE'
    sortOrder: Joi.string().valid('ASC', 'DESC').default('ASC'),
    columns: Joi.string()
        .pattern(/^[a-zA-Z, ]+$/)
        .allow(''), // Рядок з розділеними комами назвами колонок

    // Розширені фільтри для різних колонок
    name: filterValueSchema,
    email: filterValueSchema,
    age: filterValueSchema, // Для числової фільтрації
    createdAt: filterValueSchema, // Для фільтрації по даті
    // Додайте інші колонки, які ви хочете зробити фільтрованими
})

// Маршрут для отримання списку користувачів
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

        const { page, limit, sortBy, sortOrder, columns } = value

        // Виділяємо фільтри з req.query
        const filters = {}
        for (const key in value) {
            if (UserDao.defaultColumns.includes(key.toUpperCase()) && value[key] !== undefined) {
                filters[key] = value[key]
            }
        }

        // Перетворення рядка колонок в масив
        const requestedColumns = columns
            ? columns.split(',').map((col) => col.trim().toUpperCase())
            : []

        const users = await UserDao.find({
            page,
            limit,
            sortBy,
            sortOrder,
            filters,
            columns: requestedColumns, // Передаємо запитувані колонки в DAO
        })

        res.json(users)
    } catch (err) {
        next(err) // Передаємо помилку до центрального обробника помилок
    }
})

// Маршрут для отримання користувача за ID
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params
        const { columns } = req.query // Дозволяємо вибір колонок для by ID
        const requestedColumns = columns
            ? columns.split(',').map((col) => col.trim().toUpperCase())
            : []

        const user = await UserDao.findById(id, requestedColumns)

        if (!user) {
            return res.status(404).json({ message: 'User not found' })
        }

        res.json(user)
    } catch (err) {
        next(err)
    }
})

export default router
