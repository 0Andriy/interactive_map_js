// user.controller.js

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Управління користувачами та їх доступами
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     UserRequest:
 *       type: object
 *       required: [username, email, password]
 *       properties:
 *         username: { type: string, example: "john_doe" }
 *         email: { type: string, format: email, example: "john@example.com" }
 *         password: { type: string, format: password }
 *         roleIds:
 *           type: array
 *           items: { type: integer }
 *           example: [1, 2]
 *
 *     UserResponse:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         username: { type: string }
 *         email: { type: string }
 *         roles:
 *           type: array
 *           items: { $ref: '#/components/schemas/Role' }
 */

class UserController {
    /**
     * @param {UserService} userService
     */
    constructor(userService) {
        this.userService = userService
    }

    /**
     * @swagger
     * /api/users:
     *   post:
     *     summary: Створити нового користувача з ролями
     *     tags: [Users]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: '#/components/schemas/UserRequest' }
     *     responses:
     *       201:
     *         description: Користувач створений
     *         content:
     *           application/json:
     *             schema: { $ref: '#/components/schemas/UserResponse' }
     *       400:
     *         description: Помилка валідації або ролі не існують
     */
    async create(req, res, next) {
        try {
            const { roleIds, ...userData } = req.body
            const user = await this.userService.createUser(userData, roleIds)
            res.status(201).json(user)
        } catch (error) {
            next(error)
        }
    }

    /**
     * @swagger
     * /api/users/{id}:
     *   get:
     *     summary: Отримати користувача за ID (разом з ролями)
     *     tags: [Users]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: integer }
     *     responses:
     *       200:
     *         description: Дані користувача
     *         content:
     *           application/json:
     *             schema: { $ref: '#/components/schemas/UserResponse' }
     */
    async getById(req, res, next) {
        try {
            const user = await this.userService.getUser(req.params.id)
            res.json(user)
        } catch (error) {
            next(error)
        }
    }

    /**
     * @swagger
     * /api/users:
     *   get:
     *     summary: Отримати всіх користувачів
     *     tags: [Users]
     *     parameters:
     *       - in: query
     *         name: isActive
     *         schema: { type: integer, enum: [0, 1] }
     *         description: Фільтр за статусом активності
     *     responses:
     *       200:
     *         content:
     *           application/json:
     *             schema: { type: array, items: { $ref: '#/components/schemas/UserResponse' } }
     */
    async getAll(req, res, next) {
        try {
            // Передаємо query-параметри для фільтрації в Oracle
            const users = await this.userService.getAllUsers(req.query)
            res.json(users)
        } catch (error) {
            next(error)
        }
    }

    /**
     * @swagger
     * /api/users/{id}:
     *   patch:
     *     summary: Часткове оновлення даних користувача
     *     tags: [Users]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: integer }
     *     requestBody:
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               email: { type: string }
     *               isActive: { type: integer }
     *     responses:
     *       200:
     *         description: Дані оновлено
     *         content:
     *           application/json:
     *             schema: { $ref: '#/components/schemas/UserResponse' }
     */
    async update(req, res, next) {
        try {
            const user = await this.userService.updateUser(req.params.id, req.body)
            res.json(user)
        } catch (error) {
            next(error)
        }
    }

    /**
     * @swagger
     * /api/users/{id}/roles:
     *   put:
     *     summary: Оновити список ролей користувача (Sync)
     *     tags: [Users]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: integer }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [roleIds]
     *             properties:
     *               roleIds: { type: array, items: { type: integer } }
     *     responses:
     *       200:
     *         description: Ролі успішно синхронізовано
     */
    async syncRoles(req, res, next) {
        try {
            const { roleIds } = req.body
            const result = await this.userService.updateUserRoles(req.params.id, roleIds)
            res.json(result)
        } catch (error) {
            next(error)
        }
    }

    /**
     * @swagger
     * /api/users/{id}:
     *   delete:
     *     summary: Видалити користувача
     *     tags: [Users]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: integer }
     *     responses:
     *       200:
     *         description: Користувача видалено
     */
    async delete(req, res, next) {
        try {
            const result = await this.userService.deleteUser(req.params.id)
            res.json(result)
        } catch (error) {
            next(error)
        }
    }
}

export default UserController
