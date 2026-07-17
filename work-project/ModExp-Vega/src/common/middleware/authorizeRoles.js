/**
 * @file Middleware for role-based authorization in Express.
 */

import CustomError from '../utils/CustomError.js'
import logger from '../logger/logger.js'

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
export const authorizeRoles = (rolesInput = []) => {
    return (req, res, next) => {
        // НОРМАЛІЗАЦІЯ: Перетворюємо рядок на масив, якщо розробник помилився
        // 'ADMIN' -> ['ADMIN'], ['ADMIN', 'USER'] -> ['ADMIN', 'USER']
        const requiredRoles = Array.isArray(rolesInput) ? rolesInput : [rolesInput]

        try {
            // 1. Якщо requiredRoles порожній, дозволити доступ будь-якому автентифікованому користувачу
            if (requiredRoles.length === 0) {
                return next()
            }

            // 2. Перевірка наявності користувача та його ролей
            // Дані мають бути встановлені в authMiddleware - req.user
            const userRoles = req.user?.roles

            // 3. Перевірка, чи ролі користувача є масивом
            if (!Array.isArray(userRoles)) {
                throw CustomError.Unauthorized('Формат ролей користувача невірний або відсутній')
            }

            // Check if the user has at least one of the required roles
            const hasPermission = requiredRoles.some((role) => {
                // Переконуємося, що порівнюємо рядки в одному регістрі
                const normalizedRole = String(role).toUpperCase()
                return userRoles.map((r) => String(r).toUpperCase()).includes(normalizedRole)
            })

            if (!hasPermission) {
                // Логуємо спробу порушення доступу (logger автоматично додасть context)
                logger?.warn?.(
                    `Forbidden: User ${req.user?.id} attempted to access restricted route`,
                    {
                        required: requiredRoles,
                        actual: userRoles,
                        url: req.originalUrl,
                    },
                )

                throw CustomError.Forbidden('У вас недостатньо прав для виконання цієї дії.')
            }

            next()
        } catch (error) {
            next(error)
        }
    }
}
