/**
 * @file Middleware for role-based authorization in Express.
 */

/**
 * Middleware to authorize access based on user roles.
 * This middleware assumes that `req.user` has been populated by a preceding authentication middleware
 * and contains a `roles` property, which is an array of strings representing the user's roles.
 *
 * If the user does not have `req.user` or `req.user.roles` is not an array, it returns a 401 Unauthorized error.
 * If the user's roles include at least one of the `requiredRoles`, the request proceeds to the next middleware.
 * Otherwise, it returns a 403 Forbidden error.
 *
 * @param {string[]} requiredRoles - An array of roles that are allowed to access the route.
 * @returns {function(import('express').Request, import('express').Response, import('express').NextFunction): void} An Express middleware function.
 */
export const authorizeRoles = (requiredRoles = []) => {
    return (req, res, next) => {
        try {
            // Якщо requiredRoles порожній, дозволити доступ будь-якому автентифікованому користувачу
            if (requiredRoles.length === 0) {
                return next()
            }

            // req.user is expected to be set by authMiddleware
            if (!req.user || !req.user.roles || !Array.isArray(req.user.roles)) {
                return res.status(401).json({
                    message: 'Неавторизований доступ. Не вдалося визначити ролі користувача.',
                    code: 'UNAUTHORIZED_ROLES_MISSING',
                })
            }

            const userRoles = req.user.roles

            // Check if the user has at least one of the required roles
            const hasPermission = requiredRoles.some((role) => userRoles.includes(role))

            if (!hasPermission) {
                return res.status(403).json({
                    message: 'Доступ заборонено. Недостатньо прав для виконання цієї дії.',
                    code: 'FORBIDDEN_INSUFFICIENT_ROLES',
                })
            }

            next()
        } catch (error) {
            next(error)
            // return res.status(500).json({ message: 'Internal server error during authorization.' })
        }
    }
}
