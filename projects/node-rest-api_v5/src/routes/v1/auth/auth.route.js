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

router.post('/signup', validateSchema({ body: authSchemas.registerSchema }), authControler.register)

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

router.post('/login', validateSchema({ body: authSchemas.loginSchema }), authControler.login)

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: User logout
 *     description: Invalidates the current user's refresh token and clears auth cookies. Requires an active access token in the Authorization header.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully logged out (no content)
 *       401:
 *         description: Unauthorized
 */

router.post('/logout', authMiddleware, authControler.logoutController)

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
    validateSchema({ body: authSchemas.refreshTokenSchema }),
    authControler.refresh,
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

router.get('/refresh', authControler.refresh)

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

router.post('/verify-token', authControler.verifyAccessToken)

/**
 * @swagger
 * /api/v1/auth/forgot-password:
 *   post:
 *     summary: Request a password reset link
 *     tags: [Auth]
 *     description: Sends a password reset link to the user's email if the email is registered.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email address associated with the account.
 *                 example: user@example.com
 *             required:
 *               - email
 *     responses:
 *       200:
 *         description: Password reset email sent successfully (or message indicating so).
 *       400:
 *         description: Bad request (e.g., invalid email format)
 *       500:
 *         description: Internal server error
 */

router.post(
    '/forgot-password',
    validateSchema({ body: authSchemas.forgotPasswordRequestSchema }),
    authController.forgotPasswordController,
)

/**
 * @swagger
 * /api/v1/auth/reset-password/{token}:
 *   post:
 *     summary: Reset user password
 *     tags: [Auth]
 *     description: Sets a new password for the user using a valid password reset token.
 *     parameters:
 *       - in: path
 *         name: token
 *         schema:
 *           type: string
 *         required: true
 *         description: The password reset token received via email.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *               - confirmNewPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 description: The new password (min 8 chars, at least one uppercase, one lowercase, one number, one special character).
 *               confirmNewPassword:
 *                 type: string
 *                 description: Confirmation of the new password. Must match newPassword.
 *             example:
 *               newPassword: NewSecurePassword123!
 *               confirmNewPassword: NewSecurePassword123!
 *     responses:
 *       200:
 *         description: Password reset successfully.
 *       400:
 *         description: Invalid request (e.g., passwords do not match, weak password, invalid token format).
 *       404:
 *         description: Invalid or expired reset token.
 *       500:
 *         description: Internal server error.
 */

router.post(
    '/reset-password/:token',
    validateSchema({ body: authSchemas.resetPasswordSchema }),
    authController.resetPasswordController,
)

/**
 * @swagger
 * /api/v1/auth/verify-email/{token}:
 *   get:
 *     summary: Verify user's email address
 *     tags: [Auth]
 *     description: Verifies the user's email address using a token sent to their email.
 *     parameters:
 *       - in: path
 *         name: token
 *         schema:
 *           type: string
 *         required: true
 *         description: The email verification token.
 *     responses:
 *       200:
 *         description: Email verified successfully.
 *       400:
 *         description: Invalid or expired verification token.
 *       404:
 *         description: Verification token not found.
 *       500:
 *         description: Internal server error.
 */

router.get('/verify-email/:token', authController.verifyEmailController)

/**
 * @swagger
 * /api/v1/auth/resend-verification-email:
 *   post:
 *     summary: Resend email verification link
 *     tags: [Auth]
 *     description: Sends a new email verification link to the user's registered email address.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email address of the user who needs to verify.
 *             example:
 *               email: user@example.com
 *     responses:
 *       200:
 *         description: Verification email sent successfully (or message indicating so).
 *       400:
 *         description: Bad request (e.g., email already verified, invalid email format)
 *       500:
 *         description: Internal server error
 */

router.post(
    '/resend-verification-email',
    validateSchema({ body: authSchemas.resendVerificationEmailSchema }),
    authController.resendVerificationEmailController,
)

/**
 * @swagger
 * /api/v1/auth/change-password:
 *   post:
 *     summary: Change user password for an authenticated user
 *     tags: [Auth]
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
 *               newPassword:
 *                 type: string
 *                 description: The new password (min 8 chars, at least one uppercase, one lowercase, one number, one special character).
 *               confirmNewPassword:
 *                 type: string
 *                 description: Confirmation of the new password. Must match newPassword.
 *             example:
 *               currentPassword: OldSecurePassword123!
 *               newPassword: NewSecurePasswordABC@!
 *               confirmNewPassword: NewSecurePasswordABC@!
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

router.post(
    '/change-password',
    authMiddleware, // Protect this route
    validateSchema({ body: authSchemas.changePasswordSchema }),
    authController.changePasswordController,
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

router.get('/verify-token', authControler.verifyTokenFromHeaderOrQueryController)

export default router
