import { Router } from 'express'
import * as userControler from './auth.controller.js'
import { validateSchema } from '../../../middleware/validateSchema.js'
import * as userSchemas from './schemas/auth.schemas.js'

const router = Router()

// prefix: /api/v1/user

/**
 * @swagger
 * tags:
 *   name: User
 *   description: Authentication and session management
 */

/**
 * @swagger
 * /api/v1/user/signup:
 *   post:
 *     summary: Register user and login
 *     tags: [User]
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
 *               password:
 *                 type: string
 *                 description: The password of the user
 *             example:
 *               username: johndoe
 *               password: securepassword
 *     responses:
 *       201:
 *         description: Session created successfully
 *       400:
 *         description: Missing username or password
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post('/signup', validateSchema(userSchemas.registerSchema, 'body'), userControler.signup)




export default router
