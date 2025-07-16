// routes/users.js
import express from 'express'
import Joi from 'joi'
import UserDao from '../models/UserDao.js'

const router = express.Router()

const filterValueSchema = Joi.alternatives().try(
    Joi.string(),
    Joi.number(),
    Joi.boolean(),
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
                Joi.array().items(Joi.string(), Joi.number()).min(1).max(2),
            )
            .when('op', {
                is: Joi.string().valid('isnull', 'isnotnull'),
                then: Joi.forbidden(),
                otherwise: Joi.required(),
            }),
    }),
)

const getUsersSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().valid('ID', 'NAME', 'EMAIL', 'CREATED_AT', 'AGE').default('ID'),
    sortOrder: Joi.string().valid('ASC', 'DESC').default('ASC'),
    columns: Joi.string()
        .pattern(/^[a-zA-Z, ]+$/)
        .allow(''),
    search: Joi.string().min(1).max(255).allow(''), // Новий параметр для глобального пошуку

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

        const { page, limit, sortBy, sortOrder, columns, search } = value

        const filters = {}
        for (const key in value) {
            // Перевіряємо, чи ключ є однією з колонок за замовчуванням та не є спеціальним параметром
            if (UserDao.defaultColumns.includes(key.toUpperCase()) && value[key] !== undefined) {
                filters[key] = value[key]
            }
        }

        const requestedColumns = columns
            ? columns.split(',').map((col) => col.trim().toUpperCase())
            : []

        const users = await UserDao.find({
            page,
            limit,
            sortBy,
            sortOrder,
            filters,
            columns: requestedColumns,
            search, // Передаємо параметр глобального пошуку в DAO
        })

        res.json(users)
    } catch (err) {
        next(err)
    }
})

router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params
        const { columns } = req.query
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
