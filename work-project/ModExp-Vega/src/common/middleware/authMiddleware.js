/**
 * @file Express middleware for JWT authentication and role-based authorization.
 */

import { JwtManager } from '../jwt/JwtManager.js'
import CustomError from '../utils/CustomError.js'

/**
 * Middleware for authenticating requests using a JWT token and optionally authorizing based on user roles.
 *
 * This middleware performs the following steps:
 * 1. **Extracts Token:** Attempts to extract the JWT token from the `Authorization` header (expects "Bearer <token>").
 * 2. **Token Validation:** If no token is provided, it returns a 401 Unauthorized response.
 * 3. **Token Verification:** Verifies the extracted token using `jwtManager.verify()`.
 * - If verification fails (e.g., invalid signature, expired token), it logs the error and returns a 403 Forbidden or 500 Internal Server Error (for unexpected verification issues).
 * - If the token is valid but `decodedUser` is null, it returns a 403 Forbidden response.
 * 4. **Attach User Data:** Attaches the decoded user payload to `req.user`. It ensures that `req.user.roles` is an array, defaulting to an empty array if not present or not an array.
 *
 * @returns {function(import('express').Request, import('express').Response, import('express').NextFunction): Promise<void>} An Express asynchronous middleware function.
 */
export const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization']
        const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1].trim() : null

        if (!token) {
            throw CustomError.Unauthorized('Токен не надано. Доступ заборонено.')
        }

        // Верифікація
        // CustomError.from(error) у нашому глобальному обробнику сам зрозуміє,
        // якщо це TokenExpiredError, і поставить 401.
        const decodedUser = await JwtManager.getInstance().use('access').verify(token)

        if (!decodedUser) {
            throw CustomError.Unauthorized('Недійсний токен.')
        }

        // Нормалізація даних користувача
        req.user = {
            ...decodedUser,
            roles: Array.isArray(decodedUser.roles) ? decodedUser.roles : [],
        }

        // Оновлюємо контекст логера, щоб тепер ми знали ID користувача
        if (req.context) {
            req.context.user = {
                id: req.user.userId || req.user.sub,
                login: req.user.login || req.user.username,
                roles: req.user.roles,
            }
        }

        next()
    } catch (error) {
        // Наш CustomError.from автоматично обробить помилки JWT (expired/invalid)
        next(error)
    }
}
