// routes/users.js
import express from 'express'
import Joi from 'joi'
import UserDao from '../models/UserDao.js'

const router = express.Router()

// Схема валідації для GET /users
const getUsersSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().valid('ID', 'NAME', 'EMAIL', 'CREATED_AT').default('ID'), // Переконайтесь, що ці колонки існують
    sortOrder: Joi.string().valid('ASC', 'DESC').default('ASC'),
    name: Joi.string().max(255).allow(''), // Фільтр за іменем
    email: Joi.string().email().max(255).allow(''), // Фільтр за email
    // Додайте інші можливі фільтри тут
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

        const { page, limit, sortBy, sortOrder, name, email } = value

        const filters = {}
        if (name) filters.name = name
        if (email) filters.email = email

        const users = await UserDao.find({
            page,
            limit,
            sortBy,
            sortOrder,
            filters,
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
        const user = await UserDao.findById(id)

        if (!user) {
            return res.status(404).json({ message: 'User not found' })
        }

        res.json(user)
    } catch (err) {
        next(err)
    }
})

export default router
