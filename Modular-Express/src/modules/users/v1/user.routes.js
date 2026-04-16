import { Router } from 'express'
import asyncHandler from '../../../common/utils/catchAsync.js'
import { validate } from '../../../common/middleware/validation.middleware.js'
import {
    CreateUserSchema,
    UpdateUserSchema,
    UserQuerySchema,
    UserIdParamSchema,
} from './user.schema.js'

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: API для управління користувачами (доступно для ADMIN та авторизованих користувачів)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "123"
 *         username:
 *           type: string
 *           example: "jdoe_99"
 *         email:
 *           type: string
 *           format: email
 *           example: "j.doe@example.com"
 *         roles:
 *           type: array
 *           items:
 *             type: string
 *           example: ["USER", "ADMIN"]
 *         isActive:
 *           type: boolean
 *           example: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *
 *     PaginationMeta:
 *       type: object
 *       properties:
 *         total: { type: integer, example: 100 }
 *         page: { type: integer, example: 1 }
 *         limit: { type: integer, example: 10 }
 *         totalPages: { type: integer, example: 10 }
 *         hasNext: { type: boolean, example: true }
 *         hasPrev: { type: boolean, example: false }
 *
 *     CreateUserRequest:
 *       type: object
 *       required: [username, email, password]
 *       properties:
 *         username: { type: string, minLength: 3 }
 *         email: { type: string, format: email }
 *         password: { type: string, minLength: 8 }
 *         roles: { type: array, items: { type: string } }
 *
 *     UpdateUserRequest:
 *       type: object
 *       properties:
 *         username: { type: string }
 *         email: { type: string, format: email }
 *         isActive: { type: boolean }
 *         roles: { type: array, items: { type: string } }
 */

export function createUserRouter(userController, authMiddleware, rolesMiddleware) {
    const router = Router()

    // Глобальний захист для всіх маршрутів модуля
    router.use(authMiddleware.authenticate)

    /**
     * @swagger
     * /api/v1/users:
     *   get:
     *     summary: Отримати список користувачів з пагінацією
     *     tags: [Users]
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: query
     *         name: page
     *         schema: { type: integer, default: 1 }
     *       - in: query
     *         name: limit
     *         schema: { type: integer, default: 10 }
     *       - in: query
     *         name: search
     *         description: Пошук за логіном або email
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: Список успішно отримано
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 status: { type: string, example: success }
     *                 users: { type: array, items: { $ref: '#/components/schemas/User' } }
     *                 meta: { $ref: '#/components/schemas/PaginationMeta' }
     *       401:
     *         description: Неавторизовано
     */
    router.get(
        '/',
        rolesMiddleware(['ADMIN']),
        validate(UserQuerySchema, 'query'),
        asyncHandler(userController.getUsers),
    )

    /**
     * @swagger
     * /api/v1/users/me:
     *   get:
     *     summary: Отримати профіль поточного користувача
     *     tags: [Users]
     *     security:
     *       - bearerAuth: []
     *     responses:
     *       200:
     *         description: Профіль користувача
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 status: { type: string, example: success }
     *                 data: { $ref: '#/components/schemas/User' }
     */
    router.get('/me', asyncHandler(userController.getMe))

    /**
     * @swagger
     * /api/v1/users/{id}:
     *   get:
     *     summary: Отримати користувача за його ID
     *     tags: [Users]
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: string }
     *     responses:
     *       200:
     *         description: Успіх
     *       404:
     *         description: Користувача не знайдено
     */
    // /\/(?<id>\d+)$/
    router.get('/:id', validate(UserIdParamSchema, 'params'), asyncHandler(userController.getUser))

    /**
     * @swagger
     * /api/v1/users:
     *   post:
     *     summary: Створити нового користувача (Admin Only)
     *     tags: [Users]
     *     security:
     *       - bearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: '#/components/schemas/CreateUserRequest' }
     *     responses:
     *       201:
     *         description: Користувача створено
     *       409:
     *         description: Email вже існує
     */
    router.post(
        '/',
        rolesMiddleware(['ADMIN']),
        validate(CreateUserSchema, 'body'),
        asyncHandler(userController.create),
    )

    /**
     * @swagger
     * /api/v1/users/{id}:
     *   patch:
     *     summary: Часткове оновлення даних користувача
     *     tags: [Users]
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *     requestBody:
     *       content:
     *         application/json:
     *           schema: { $ref: '#/components/schemas/UpdateUserRequest' }
     *     responses:
     *       200:
     *         description: Оновлено успішно
     */
    router.patch(
        '/:id',
        rolesMiddleware(['ADMIN']),
        validate(UserIdParamSchema, 'params'),
        validate(UpdateUserSchema, 'body'),
        asyncHandler(userController.update),
    )

    /**
     * @swagger
     * /api/v1/users/{id}:
     *   delete:
     *     summary: Видалити користувача
     *     tags: [Users]
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *     responses:
     *       204:
     *         description: Видалено (немає контенту)
     */
    router.delete(
        '/:id',
        rolesMiddleware(['ADMIN']),
        validate(UserIdParamSchema, 'params'),
        asyncHandler(userController.delete),
    )

    return router
}
