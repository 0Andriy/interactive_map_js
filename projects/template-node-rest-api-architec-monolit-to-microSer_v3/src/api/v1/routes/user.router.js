import { Router } from 'express'
import * as userController from '../controllers/user.controller.js'
import { validateSchema } from '../../../middlewares/validateSchema.js'
import * as userSchema from '../validators/user.schema.js'
import { authenticateToken } from '../../../middlewares/authMiddleware.js'
import { authorizeRoles } from '../../../middlewares/authorizeRoles.js'

const router = Router()

// prefix: /api/v1/users

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management
 */

/**
 * @swagger
 * /api/v1/users:
 *   post:
 *     summary: Create new user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: The username of the user
 *                 example: johndoe
 *               email:
 *                 type: string
 *                 description: User's email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 description: The password of the user
 *                 example: securepassword
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Missing username or password
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */

router.post(
    '/',
    authorizeRoles(['admin']),
    validateSchema({ body: userSchema.createUserSchema }),
    userController.createUser,
)

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: Get all users (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of users per page
 *     responses:
 *       200:
 *         description: A list of users
 *         content:
 *           application/json:
 *             example:
 *               users: [{ id: "123", name: "John" }]
 *       403:
 *         description: Forbidden - Admin access required
 */

router.get('/', authorizeRoles(['admin']), userController.getAllUsers)

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     summary: Get user by ID (Admin only or own profile)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User data
 *         content:
 *           application/json:
 *             example:
 *               id: "123"
 *               name: "Jane Doe"
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */

router.get(/(?<id>\d+)$/, userController.getUserById)

/**
 * @swagger
 * /api/v1/users/me:
 *   get:
 *     summary: Get current user's profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user's profile data
 *         content:
 *           application/json:
 *             example:
 *               id: "123"
 *               name: "John Doe"
 *               email: "john@example.com"
 *       401:
 *         description: Unauthorized
 */

router.get('/me', userController.getMe)

/**
 * @swagger
 * /api/v1/users/{id}:
 *   put:
 *     summary: Update user profile (Admin or own profile)
 *     tags: [Users]
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
 *             username: "Jane Updated"
 *             email: "jane@example.com"
 *     responses:
 *       200:
 *         description: User updated successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */

router.put('/:id', validateSchema({ body: userSchema.updateUserSchema }), userController.updateUser)

/**
 * @swagger
 * /api/v1/users/{id}:
 *   delete:
 *     summary: Delete a user (Admin or own profile)
 *     tags: [Users]
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
 *         description: User deleted successfully
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */

router.delete('/:id', userController.deleteUser)

/**
 * @swagger
 * /api/v1/users/{id}/change-password:
 *   put:
 *     summary: Change user password (Admin only)
 *     tags: [Users]
 *     description: Allows an authenticated user to change their password by providing the current and new passwords.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 description: The new password (min 8 chars, at least one uppercase, one lowercase, one number, one special character).
 *                 example: NewSecurePasswordABC@!
 *     responses:
 *       200:
 *         description: Password changed successfully.
 *       401:
 *         description: Unauthorized (invalid access token or incorrect current password).
 *       400:
 *         description: Bad request (e.g., new passwords do not match, weak new password).
 *       500:
 *         description: Internal server error.
 */

router.put(
    /(?<id>\d+)\/change-password$/,
    authorizeRoles(['admin']),
    validateSchema({ body: userSchema.adminChangeUserPasswordSchema }),
    userController.changePassword,
)

/**
 * @swagger
 * /api/v1/users/me/change-password:
 *   put:
 *     summary: Change user password (Own profile)
 *     tags: [Users]
 *     description: Allows an authenticated user to change their password by providing the current and new passwords.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *               - confirmNewPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 description: The user's current password.
 *                 example: OldSecurePassword123!
 *               newPassword:
 *                 type: string
 *                 description: The new password (min 8 chars, at least one uppercase, one lowercase, one number, one special character).
 *                 example: NewSecurePasswordABC@!
 *               confirmNewPassword:
 *                 type: string
 *                 description: Confirmation of the new password. Must match newPassword.
 *                 example: NewSecurePasswordABC@!
 *     responses:
 *       200:
 *         description: Password changed successfully.
 *       401:
 *         description: Unauthorized (invalid access token or incorrect current password).
 *       400:
 *         description: Bad request (e.g., new passwords do not match, weak new password).
 *       500:
 *         description: Internal server error.
 */

router.put(
    '/me/change-password',
    validateSchema({ body: userSchema.changeOwnPasswordSchema }),
    userController.changePassword,
)

/**
 * @swagger
 * /api/v1/users/{id}/roles:
 *   post:
 *     summary: Assign a role to a user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user to assign the role to
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roleIds
 *             properties:
 *               roleIds:
 *                 type: array
 *                 description: Список ID ролей для призначення користувачу.
 *                 items:
 *                   type: number
 *                 example: [1, 2, 3]
 *     responses:
 *       200:
 *         description: Role assigned successfully
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User or Role not found
 */

router.post(
    '/:id/roles',
    authorizeRoles(['admin']),
    validateSchema({ body: userSchema.assignRolesSchema }),
    userController.assignRoles,
)

/**
 * @swagger
 * /api/v1/users/{id}/roles:
 *   get:
 *     summary: Get roles assigned to a user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user to get roles for
 *     responses:
 *       200:
 *         description: List of roles assigned to the user
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   role_id:
 *                     type: number
 *                   role_name:
 *                     type: string
 *                   is_active:
 *                     type: boolean
 *       404:
 *         description: User not found
 */

router.get('/:id/roles', authorizeRoles(['admin', 'manager']), userController.getUserRoles)

/**
 * @swagger
 * /api/v1/users/{id}/roles:
 *   delete:
 *     summary: Revoke multiple roles from a user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roleIds
 *             properties:
 *               roleIds:
 *                 type: array
 *                 description: List of role IDs to revoke from the user
 *                 items:
 *                   type: number
 *                 example: [1, 2, 3]
 *     responses:
 *       204:
 *         description: Roles revoked successfully
 *       404:
 *         description: User or one of the roles not found
 *       403:
 *         description: Forbidden
 */

router.delete(
    '/:id/roles',
    authorizeRoles(['admin']),
    validateSchema({ body: userSchema.revokeRolesSchema }),
    userController.revokeUserRoles,
)

export default router
