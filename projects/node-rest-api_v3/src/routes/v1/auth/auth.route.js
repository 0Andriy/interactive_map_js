// src/routes/v1/auth/auth.route.js
import { Router } from 'express'
import * as authControler from './auth.controller.js'
import { validateSchema } from '../../../middleware/validateSchema.js'
import * as authSchemas from './schemas/auth.schemas.js'
import { authMiddleware } from '../../../middleware/authMiddleware.js'

const router = Router()

// prefix: /api/v1/auth

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and session management
 */

/**
 * @swagger
 * /api/v1/auth/signup:
 *   post:
 *     summary: Register user and login
 *     tags: [Auth]
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
router.post(
    '/signup',
    validateSchema(authSchemas.registerSchema, 'body'),
    authControler.registerController,
) //authControler.signup

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: User login
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: User's email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 description: User's password
 *                 example: Password123
 *             required:
 *               - username
 *               - password
 *     responses:
 *       200:
 *         description: Successful login
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: JWT access token
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI...
 *                 refreshToken:
 *                   type: string
 *                   description: JWT refresh token
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI...
 *       401:
 *         description: Invalid credentials
 *       400:
 *         description: Bad request
 */
router.post(
    '/login',
    validateSchema(authSchemas.loginSchema, 'body'),
    authControler.loginController,
)

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: User logout
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully logged out
 *       401:
 *         description: Unauthorized
 */
router.post('/logout', authControler.logoutFromBodyController)

// router.get("/logout", logout_get)

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: JWT refresh token
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI...
 *             required:
 *               - refreshToken
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: New JWT access token
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI...
 *       401:
 *         description: Invalid or expired refresh token
 *       400:
 *         description: Bad request
 */

router.post(
    '/refresh',
    validateSchema(refreshTokenSchema, 'body'),
    authControler.refreshTokensFromBodyController,
)

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   get:
 *     summary: Refresh user token using refresh token stored in cookies
 *     tags: [Auth]
 *
 *     responses:
 *       200:
 *         description: Successfully refreshed the tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: New access token.
 *                 refreshToken:
 *                   type: string
 *                   description: New refresh token.
 *       401:
 *         description: Invalid or missing refresh token
 *       500:
 *         description: Internal server error
 */
// Refresh читається з кук, тому валідація тіла запиту не потрібна
router.get('/refresh', authControler.refreshTokensFromCookieController)

/**
 * @swagger
 * /api/v1/auth/verify-token:
 *   post:
 *     summary: Перевірити дійсність Access Token (через тіло запиту)
 *     description: >
 *       Цей ендпоінт дозволяє перевірити дійсність наданого Access Token,
 *       переданого у тілі запиту.
 *
 *       **Важливо:** Передача токенів через тіло запиту менш безпечна, ніж через заголовок `Authorization`,
 *       і рекомендована лише для сценаріїв, де заголовок `Authorization` не може бути використаний.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - access_token
 *             properties:
 *               access_token:
 *                 type: string
 *                 description: JWT Access Token
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: Token is valid
 *       401:
 *         description: Invalid or expired token
 */

router.post('/verify-token', authControler.verifyTokenController)

/**
 * @swagger
 * /api/v1/auth/verify-token:
 *   get:
 *     summary: Перевірити дійсність Access Token (через заголовок або Query Parameter)
 *     description: >
 *       Цей ендпоінт дозволяє перевірити дійсність наданого Access Token.
 *       Токен очікується в заголовку `Authorization` у форматі `Bearer <token>`
 *       **АБО** як параметр запиту `access_token` або `accessToken`.
 *
 *       **Важливо:** Передача токенів через параметри запиту менш безпечна і не рекомендована для чутливих даних.
 *     tags:
 *       - Auth
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         schema:
 *           type: string
 *           pattern: "^Bearer [A-Za-z0-9-_=]+\\.[A-Za-z0-9-_=]+\\.[A-Za-z0-9-_.+/=]*$"
 *         description: |
 *           Access Token у форматі Bearer.
 *           Приклад: `Bearer eyJhbGciOiJIUzI1Ni...`
 *         required: false
 *       - in: query
 *         name: access_token
 *         schema:
 *           type: string
 *         description: |
 *           Access Token як параметр запиту.
 *           **Використовуйте тільки якщо неможливо передати через заголовок Authorization.**
 *           Приклад: `?access_token=eyJhbGciOiJIUzI1Ni...`
 *         required: false
 *       - in: query
 *         name: accessToken
 *         schema:
 *           type: string
 *         description: |
 *           Альтернативна назва параметра для Access Token.
 *           Приклад: `?accessToken=eyJhbGciOiJIUzI1Ni...`
 *         required: false
 *     responses:
 *       200:
 *         description: Token is valid
 *       401:
 *         description: Invalid or expired token
 */

router.get('/verify-token', authControler.verifyTokenController) // Використовуємо GET, оскільки це запит на отримання статусу.

export default router
