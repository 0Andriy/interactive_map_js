/**
 * @swagger
 * tags:
 *   name: Roles
 *   description:  API для управління ролями доступу (доступно для ADMIN)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Role:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Унікальний ідентифікатор ролі
 *           example: "12354"
 *         name:
 *           type: string
 *           description: Унікальна назва ролі (наприклад, ADMIN, USER)
 *           example: "ADMIN"
 *         description:
 *           type: string
 *           description: Короткий опис прав, які надає ця роль
 *           example: "Повний доступ до всіх ресурсів системи"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Дата створення
 *           example: "2023-10-27T12:00:00Z"
 *
 *     RoleInput:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           description: Назва нової ролі
 *           example: "MODERATOR"
 *         description:
 *           type: string
 *           description: Опис повноважень ролі
 *           example: "Може редагувати контент, але не видаляти користувачів"
 *
 *     RoleUpdate:
 *       type: object
 *       properties:
 *         description:
 *           type: string
 *           description: Оновлений опис ролі
 *           example: "Розширені права для модерації коментарів"
 */

export class RoleController {
    /**
     * @param {import('./role.service.js').RoleService} roleService
     */
    constructor(roleService) {
        this.roleService = roleService
    }

    /**
     * @swagger
     * /api/roles:
     *   get:
     *     summary: Отримати список всіх ролей
     *     tags: [Roles]
     *     security:
     *       - bearerAuth: []
     *     responses:
     *       200:
     *         description: Список ролей успішно отримано
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items:
     *                 $ref: '#/components/schemas/Role'
     */
    async getAll(req, res) {
        try {
            const roles = await this.roleService.getAllRoles()
            res.status(200).json(roles)
        } catch (error) {
            res.status(500).json({ error: error.message })
        }
    }

    /**
     * @swagger
     * /api/roles/{id}:
     *   get:
     *     summary: Отримати роль за ID
     *     tags: [Roles]
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *         description: ID ролі
     *     responses:
     *       200:
     *         description: Дані ролі
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Role'
     *       404:
     *         description: Роль не знайдено
     */
    async getById(req, res) {
        try {
            const { id } = req.params
            const role = await this.roleService.getRoleById(id)
            res.status(200).json(role)
        } catch (error) {
            res.status(404).json({ error: error.message })
        }
    }

    /**
     * @swagger
     * /api/roles:
     *   post:
     *     summary: Створити нову роль
     *     tags: [Roles]
     *     security:
     *       - bearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/RoleInput'
     *     responses:
     *       201:
     *         description: Роль успішно створена
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Role'
     *       403:
     *         description: Недостатньо прав (тільки для ADMIN)
     */
    async create(req, res) {
        try {
            const newRole = await this.roleService.createRole(req.body)
            res.status(201).json(newRole)
        } catch (error) {
            res.status(400).json({ error: error.message })
        }
    }

    /**
     * @swagger
     * /api/roles/{id}:
     *   put:
     *     summary: Оновити існуючу роль
     *     tags: [Roles]
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     requestBody:
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/Role'
     *     responses:
     *       200:
     *         description: Роль оновлена
     *       404:
     *         description: Роль не знайдена
     */
    async update(req, res) {
        try {
            const { id } = req.params
            const updatedRole = await this.roleService.updateRole(id, req.body)
            res.status(200).json(updatedRole)
        } catch (error) {
            res.status(400).json({ error: error.message })
        }
    }

    /**
     * @swagger
     * /api/roles/{id}:
     *   delete:
     *     summary: Видалити роль
     *     tags: [Roles]
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     responses:
     *       200:
     *         description: Роль успішно видалена
     */
    async delete(req, res) {
        try {
            const { id } = req.params
            const result = await this.roleService.deleteRole(id)
            res.status(200).json(result)
        } catch (error) {
            res.status(400).json({ error: error.message })
        }
    }
}
