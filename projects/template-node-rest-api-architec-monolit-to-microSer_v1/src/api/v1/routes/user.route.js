// import { Router } from 'express'
// import * as userController from '../controllers/user.controller.js'
// import { validateSchema } from '../../../middlewares/validateSchema.js'
// import * as userSchema from '../validators/user.schema.js'
// import { authenticateToken, authorizeRole } from '../../../middlewares/authMiddleware.js'

// const router = Router()

// // prefix: /api/v1/users

// /**
//  * @swagger
//  * tags:
//  * name: Users
//  * description: User management
//  */

// /**
//  * @swagger
//  * /api/v1/users/me:
//  * get:
//  * summary: Get current user's profile
//  * tags: [Users]
//  * security:
//  * - bearerAuth: []
//  * responses:
//  * 200:
//  * description: Current user's profile data
//  * content:
//  * application/json:
//  * schema:
//  * $ref: '#/components/schemas/User'
//  * 401:
//  * description: Unauthorized
//  */
// router.get('/me', userController.getMe)

// /**
//  * @swagger
//  * /api/v1/users:
//  * get:
//  * summary: Get all users (Admin only)
//  * tags: [Users]
//  * security:
//  * - bearerAuth: []
//  * parameters:
//  * - in: query
//  * name: page
//  * schema:
//  * type: integer
//  * default: 1
//  * description: Page number
//  * - in: query
//  * name: limit
//  * schema:
//  * type: integer
//  * default: 10
//  * description: Number of users per page
//  * responses:
//  * 200:
//  * description: A list of users
//  * 403:
//  * description: Forbidden - Admin access required
//  */
// router.get('/', authorizeRole(['admin']), userController.getAllUsers)

// /**
//  * @swagger
//  * /api/v1/users/{id}:
//  * get:
//  * summary: Get user by ID (Admin only or own profile)
//  * tags: [Users]
//  * security:
//  * - bearerAuth: []
//  * parameters:
//  * - in: path
//  * name: id
//  * required: true
//  * schema:
//  * type: string
//  * description: User ID
//  * responses:
//  * 200:
//  * description: User data
//  * 403:
//  * description: Forbidden
//  * 404:
//  * description: User not found
//  */
// router.get('/:id', userController.getUserById)

// /**
//  * @swagger
//  * /api/v1/users/{id}:
//  * put:
//  * summary: Update user profile (Admin or own profile)
//  * tags: [Users]
//  * security:
//  * - bearerAuth: []
//  * parameters:
//  * - in: path
//  * name: id
//  * required: true
//  * schema:
//  * type: string
//  * requestBody:
//  * required: true
//  * content:
//  * application/json:
//  * schema:
//  * $ref: '#/components/schemas/UpdateUser'
//  * responses:
//  * 200:
//  * description: User updated successfully
//  * 400:
//  * description: Bad request
//  * 403:
//  * description: Forbidden
//  * 404:
//  * description: User not found
//  */
// router.put('/:id', validateSchema({ body: userSchema.updateUserSchema }), userController.updateUser)

// /**
//  * @swagger
//  * /api/v1/users/{id}:
//  * delete:
//  * summary: Delete a user (Admin or own profile)
//  * tags: [Users]
//  * security:
//  * - bearerAuth: []
//  * parameters:
//  * - in: path
//  * name: id
//  * required: true
//  * schema:
//  * type: string
//  * responses:
//  * 204:
//  * description: User deleted successfully
//  * 403:
//  * description: Forbidden
//  * 404:
//  * description: User not found
//  */
// router.delete('/:id', userController.deleteUser)

// /**
//  * @swagger
//  * /api/v1/users/{id}/roles:
//  * post:
//  * summary: Assign a role to a user (Admin only)
//  * tags: [Users]
//  * security:
//  * - bearerAuth: []
//  * parameters:
//  * - in: path
//  * name: id
//  * required: true
//  * schema:
//  * type: string
//  * description: The ID of the user to assign the role to
//  * requestBody:
//  * required: true
//  * content:
//  * application/json:
//  * schema:
//  * type: object
//  * properties:
//  * roleName:
//  * type: string
//  * example: "editor"
//  * responses:
//  * 200:
//  * description: Role assigned successfully
//  * 403:
//  * description: Forbidden
//  * 404:
//  * description: User or Role not found
//  */
// router.post(
//     '/:id/roles',
//     authorizeRole(['admin']),
//     validateSchema({ body: userSchema.assignRoleSchema }),
//     userController.assignRole,
// )

// export default router
