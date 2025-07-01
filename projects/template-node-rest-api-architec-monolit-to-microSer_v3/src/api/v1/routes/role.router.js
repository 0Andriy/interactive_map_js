import { Router } from 'express'
import * as roleController from '../controllers/role.controller.js'
import { validateSchema } from '../../../middlewares/validateSchema.js'
import * as roleSchema from '../validators/role.schema.js'
import { authenticateToken } from '../../../middlewares/authMiddleware.js'
import { authorizeRoles } from '../../../middlewares/authorizeRoles.js'

const router = Router()

// prefix: /api/v1/roles

/**
 * @swagger
 * tags:
 *   name: Roles
 *   description: Role management
 */

/**
 * @swagger
 * /api/v1/roles:
 *   post:
 *     summary: Create a new role (Admin only)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Role name
 *                 example: editor
 *     responses:
 *       201:
 *         description: Role created successfully
 *       400:
 *         description: Invalid input
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */
router.post(
    '/',
    authorizeRoles(['admin']),
    validateSchema({ body: roleSchema.createRoleSchema }),
    roleController.createRole,
)

/**
 * @swagger
 * /api/v1/roles:
 *   get:
 *     summary: Get all roles (Admin only)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of roles
 *         content:
 *           application/json:
 *             example:
 *               roles: [{ id: "1", name: "admin" }]
 *       403:
 *         description: Forbidden - Admin access required
 */
router.get('/', authorizeRoles(['admin']), roleController.getAllRoles)

/**
 * @swagger
 * /api/v1/roles/{id}:
 *   get:
 *     summary: Get role by ID (Admin only)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Role data
 *         content:
 *           application/json:
 *             example:
 *               id: "1"
 *               name: "editor"
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Role not found
 */
router.get('/:id', authorizeRoles(['admin']), roleController.getRoleById)

/**
 * @swagger
 * /api/v1/roles/{id}:
 *   put:
 *     summary: Update a role (Admin only)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             role_name: "supervisor"
 *     responses:
 *       200:
 *         description: Role updated successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Role not found
 */
router.put(
    '/:id',
    authorizeRoles(['admin']),
    validateSchema({ body: roleSchema.updateRoleSchema }),
    roleController.updateRole,
)

/**
 * @swagger
 * /api/v1/roles/{id}:
 *   delete:
 *     summary: Delete a role (Admin only)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Role deleted successfully
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Role not found
 */
router.delete('/:id', authorizeRoles(['admin']), roleController.deleteRole)

export default router
