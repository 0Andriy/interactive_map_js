import { Router } from "express";
import * as authControler from "./auth.controller.js"

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
router.post("/signup", authControler.signup)


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
router.post("/login", authControler.login)



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
router.post("/logout", authControler.logout)



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

router.post("/refresh", authControler.refreshTokens)



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

router.get("/refresh", authControler.refreshTokens)



/**
 * @swagger
 * /api/v1/auth/validate:
 *   post:
 *     summary: Validate access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accessToken:
 *                 type: string
 *                 description: JWT access token
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI...
 *             required:
 *               - accessToken
 *     responses:
 *       200:
 *         description: Token is valid
 *       401:
 *         description: Invalid or expired token
 */
router.post("/validate", authControler.validateToken)



export default router


