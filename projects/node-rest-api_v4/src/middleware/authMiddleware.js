/**
 * @file Express middleware for JWT authentication and role-based authorization.
 */

import jwtManager from '../utils/JwtManager.js' // Assumes JwtManager.js handles JWT signing and verification

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
 * 5. **Role-Based Authorization (Optional):**
 * - If `requiredRoles` are provided, it checks if the authenticated user possesses at least one of the specified roles.
 * - If the user has no roles or lacks any of the `requiredRoles`, it returns a 403 Forbidden response with a descriptive message.
 * 6. **Proceed:** If all checks pass, it calls `next()` to pass control to the next middleware or route handler.
 *
 * @param {Array<string>} [requiredRoles=[]] - An array of roles. If provided, the user must have at least one of these roles to access the resource. If empty or not provided, any authenticated user can access.
 * @returns {function(import('express').Request, import('express').Response, import('express').NextFunction): Promise<void>} An Express asynchronous middleware function.
 */
export const authenticateToken = (requiredRoles = []) => {
    return async (req, res, next) => {
        // 1. Extract token from the "Authorization" header
        const authHeader = req.headers['authorization']
        const token =
            authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null

        if (!token) {
            return res.status(401).json({ message: 'Необхідна аутентифікація. Токен не надано.' })
        }

        // 2. Verify the token
        let decodedUser
        try {
            decodedUser = await jwtManager.verify(token)
        } catch (error) {
            console.error('Помилка при верифікації токена:', error.message)
            return res
                .status(500) // Changed to 500 for internal server error during verification process
                .json({ message: 'Внутрішня помилка сервера при верифікації токена.' })
        }

        if (!decodedUser) {
            // This case might be hit if verification passes but decodedUser is unexpectedly null/undefined
            // which might imply a problem with how jwtManager.verify handles certain tokens or errors.
            // Could also be treated as 401 if it specifically means invalid/expired.
            return res.status(403).json({ message: 'Недійсний або протермінований токен.' })
        }

        // 3. Add user data to the request object
        // Ensure 'roles' is an array, otherwise set an empty array.
        decodedUser.roles = Array.isArray(decodedUser.roles) ? decodedUser.roles : []
        req.user = decodedUser

        // 4. Check roles (if specified)
        if (requiredRoles.length > 0) {
            if (!req.user.roles || req.user.roles.length === 0) {
                return res
                    .status(403)
                    .json({ message: 'Недостатньо прав: користувач не має призначених ролей.' })
            }

            // Check if the user has AT LEAST ONE of the required roles
            const hasRequiredRole = requiredRoles.some((role) => req.user.roles.includes(role))

            if (!hasRequiredRole) {
                return res.status(403).json({
                    message: `Недостатньо прав: необхідна одна з наступних ролей: ${requiredRoles.join(
                        ', ',
                    )}.`,
                    userRoles: req.user.roles,
                })
            }
        }

        // 5. Pass control to the next middleware or route handler
        next()
    }
}
