// src/api/v1/routes/auth/auth.route.js

import { Router } from 'express'
import * as authController from '../controllers/auth.controller.js'
import { validateSchema } from '../../../middlewares/validateSchema.js'
import * as authSchema from '../validators/auth.schema.js'
import { authenticateToken } from '../../../middlewares/authMiddleware.js'

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
 *     summary: Register (signup) user and login
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
    validateSchema({ body: authSchema.registerBodySchema }),
    authController.register,
)

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

router.post('/login', validateSchema({ body: authSchema.loginBodySchema }), authController.login)

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: User logout
 *     description: Invalidates the current user's refresh token and clears auth cookies. Requires an active access token in the Authorization header.
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
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully logged out (no content)
 *       401:
 *         description: Unauthorized
 */

router.post(
    '/logout',
    authenticateToken(),
    validateSchema({
        headers: authSchema.authorizationHeaderSchema,
        body: authSchema.logoutBodySchema,
    }),
    authController.logout,
)

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token using a refresh token from the request body
 *     description: This endpoint allows obtaining a new access token and optionally a new refresh token by providing a valid refresh token in the request body.
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
 *                 refreshToken:
 *                   type: string
 *                   description: New JWT refresh token (optional, if refresh token rotation is enabled)
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI...
 *       401:
 *         description: Invalid or expired refresh token
 *       400:
 *         description: Bad request
 */

router.post(
    '/refresh',
    validateSchema({ body: authSchema.refreshTokenSchema }),
    authController.refresh,
)

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   get:
 *     summary: Refresh access token using a refresh token stored in cookies
 *     description: This endpoint obtains a new access token and optionally a new refresh token using a valid refresh token from HttpOnly cookies.
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
 *                   example: eyJhbGciOiJIUzI1Ni...
 *                 refreshToken:
 *                   type: string
 *                   description: New refresh token (if rotation enabled). Set as HttpOnly cookie.
 *                   example: eyJhbGciOiJIUzI1Ni...
 *       401:
 *         description: Invalid or missing refresh token in cookies
 *       500:
 *         description: Internal server error
 */

router.get(
    '/refresh',
    validateSchema({ cookies: authSchema.cookiesSchema }),
    authController.refresh,
)

// /**
//  * @swagger
//  * /api/v1/auth/change-password:
//  *   post:
//  *     summary: Change user password for an authenticated user
//  *     tags: [Auth]
//  *     description: Allows an authenticated user to change their password by providing the current and new passwords.
//  *     security:
//  *       - bearerAuth: []
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - currentPassword
//  *               - newPassword
//  *               - confirmNewPassword
//  *             properties:
//  *               currentPassword:
//  *                 type: string
//  *                 description: The user's current password.
//  *                 example: OldSecurePassword123!
//  *               newPassword:
//  *                 type: string
//  *                 description: The new password (min 8 chars, at least one uppercase, one lowercase, one number, one special character).
//  *                 example: NewSecurePasswordABC@!
//  *               confirmNewPassword:
//  *                 type: string
//  *                 description: Confirmation of the new password. Must match newPassword.
//  *                 example: NewSecurePasswordABC@!
//  *     responses:
//  *       200:
//  *         description: Password changed successfully.
//  *       401:
//  *         description: Unauthorized (invalid access token or incorrect current password).
//  *       400:
//  *         description: Bad request (e.g., new passwords do not match, weak new password).
//  *       500:
//  *         description: Internal server error.
//  */

// router.post(
//     '/change-password',
//     authenticateToken(), // Protect this route
//     validateSchema({ body: authSchema.changePasswordSchema }),
//     authController.changePassword,
// )

/**
 * @swagger
 * /api/v1/auth/verify-token:
 *   post:
 *     summary: Перевірити дійсність Access Token (через тіло запиту)
 *     description: >
 *       Цей ендпоінт дозволяє перевірити дійсність наданого Access Token,
 *       переданого у тілі запиту. access_token або accessToken.
 *
 *       **Важливо:** Передача токенів через тіло запиту менш безпечна, ніж через заголовок `Authorization`,
 *       і рекомендована лише для сценаріїв, де заголовок `Authorization` не може бути використаний.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             oneOf:
 *               - required: ["access_token"]
 *                 properties:
 *                   access_token:
 *                     type: string
 *                     description: JWT Access Token
 *                     example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *               - required: ["accessToken"]
 *                 properties:
 *                   accessToken:
 *                     type: string
 *                     description: JWT Access Token
 *                     example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: Token is valid. Returns user payload.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isValid:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   type: object
 *                   description: Decoded user payload from the token.
 *       401:
 *         description: Invalid or expired token
 */

router.post(
    '/verify-token',
    validateSchema({ body: authSchema.verifyAccessTokenBodySchema }),
    authController.verifyAccessToken,
)

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
 *     tags: [Auth]
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *           pattern: "^Bearer [A-Za-z0-9-_=]+\\.[A-Za-z0-9-_=]+\\.[A-Za-z0-9-_.+/=]*$"
 *         description: |
 *           Access Token у форматі Bearer.
 *           Приклад: `Bearer eyJhbGciOiJIUzI1Ni...`
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
 *         description: Token is valid. Returns user payload.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isValid:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   type: object
 *                   description: Decoded user payload from the token.
 *       401:
 *         description: Invalid or expired token
 */

router.get(
    '/verify-token',
    validateSchema({ ...authSchema.verifyAccessTokenSchema }),
    authController.verifyAccessToken,
)

/**
 * @swagger
 * /api/v1/auth/test:
 *   get:
 *     summary: test authentication route
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Auth route is working!
 */

router.get('/test', authenticateToken(), (req, res) => {
    res.status(200).json({ message: 'Auth route is working!' })
})

export default router
