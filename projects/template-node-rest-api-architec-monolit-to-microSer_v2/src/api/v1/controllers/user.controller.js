import userService from '../services/user.service.js'
import loggerModule from '../../../utils/logger.js'
const logger = loggerModule.getLoggerForService('user-management-service')
// import { AppError } from '../../../utils/AppError.js'

/**
 * Створити користувача
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function createUser(req, res, next) {
    try {
        const dbName = req.dbName

        const { username, email, password, firstName, lastName } = req.body
        // Перевірка на наявність обов'язкових полів
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'Username, email, and password are required.' })
        }

        // Створюємо користувача
        const newUser = await userService.createUser(dbName, {
            username,
            email,
            password,
            firstName,
            lastName,
        })

        //  Повертаємо відповідь з даними користувача
        res.status(201).json({
            message: 'User created successfully.',
            user: {
                userId: newUser.USER_ID,
                username: newUser.USERNAME,
                email: newUser.EMAIL,
                firstName: newUser.FIRST_NAME,
                lastName: newUser.LAST_NAME,
                isEmailVerified: newUser.IS_EMAIL_VERIFIED,
                isActive: newUser.IS_ACTIVE,
                roles: newUser.ROLES,
            }, // Повертаємо дані користувача з об'єкта, отриманого від свторення користувача
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Отримати всіх користувачів
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function getAllUsers(req, res, next) {
    try {
        const dbName = req.dbName

        const { page, limit } = req.query

        const { users, pagination } = await userService.getAllUsers(dbName, { page, limit })

        res.status(200).json({
            message:
                'Information about users with the specified restrictions has been successfully obtained.',
            results: users.length,
            data: {
                users,
            },
            pagination: pagination,
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Отримати користувача за ID
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function getUserById(req, res, next) {
    try {
        const dbName = req.dbName

        const { id } = req.params

        const user = await userService.getUserById(dbName, id)
        if (!user) {
            return res.status(404).json({ message: 'User not found' })
        }

        res.status(200).json({
            message: 'User information by ID successfully retrieved',
            user,
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Отримати профіль поточного користувача ('/me')
 * дані пропоточного користувача береться з навантаження accessToken
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function getMe(req, res, next) {
    try {
        const dbName = req.dbName

        const { userId } = req.user

        // ID користувача додається в req.user мідлвером authenticateToken
        const user = await userService.getUserById(dbName, userId)
        if (!user) {
            return res.status(404).json({ message: 'User profile not found' })
        }

        res.status(200).json(user)
    } catch (error) {
        next(error)
    }
}

/**
 * Оновити дані користувача
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function updateUser(req, res, next) {
    try {
        const dbName = req.dbName
        const userIdToUpdate = req.params.id
        const { userId, roles } = req.user

        // Користувач може редагувати тільки свій профіль, якщо він не адміністратор
        if (userIdToUpdate !== userId.toString() && !roles.includes('admin')) {
            return res
                .status(403)
                .json({ message: 'You do not have permission to perform this action' })
        }

        // Адміністратор може змінювати поле isActive, користувач - ні
        if (req.body.isActive !== undefined && !roles.includes('admin')) {
            delete req.body.isActive
        }

        const updatedUser = await userService.updateUser(dbName, userIdToUpdate, req.body)
        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found or no changes provided' })
        }

        res.status(200).json({
            message: 'User updated successfully',
            data: {
                user: updatedUser,
            },
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Видалити користувача (м'яке видалення)
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function deleteUser(req, res, next) {
    try {
        const dbName = req.dbName
        const userIdToDelete = req.params.id
        const { userId, roles } = req.user

        // Користувач може видалити тільки свій профіль, якщо він не адміністратор
        if (userIdToDelete !== userId.toString() && !roles.includes('admin')) {
            return res
                .status(403)
                .json({ message: 'You do not have permission to perform this action' })
        }

        const success = await userService.softDeleteUser(dbName, userIdToDelete)
        if (!success) {
            return res.status(404).json({ message: 'User not found or could not be deleted' })
        }

        res.status(204).send() // 204 No Content
    } catch (error) {
        next(error)
    }
}

/**
 * Обробник для зміни пароля аутентифікованим користувачем.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function changePassword(req, res, next) {
    try {
        const dbName = req.dbName
        const { id } = req.params
        const { oldPassword, newPassword } = req.body

        let passwordChanged = false
        if (id) {
            // This is the admin changing any user's password route /api/v1/users/{id}/change-password
            // Requires admin role check to be enabled in router
            passwordChanged = await userService.adminChangeUserPassword(dbName, id, newPassword)
        } else {
            // This is the user changing their own password route /api/v1/users/me/change-password
            // Assumes req.user.id is available from authentication middleware
            const userId = req.user.userId
            if (!userId) {
                return res
                    .status(401)
                    .json({ message: 'Unauthorized: User ID not found in token.' })
            }
            passwordChanged = await userService.changeOwnPassword(
                dbName,
                userId,
                oldPassword,
                newPassword,
            )
        }

        if (passwordChanged) {
            res.status(200).json({ message: 'Password changed successfully.' })
        } else {
            res.status(400).json({ message: 'Password could not be changed.' })
        }
    } catch (error) {
        logger.error(`Change password error for user ${req.user?.userId}: ${error.message}`, {
            error,
            body: req.body,
        })
        if (error.message.includes('Invalid old password')) {
            return res.status(401).json({ message: error.message })
        }
        if (error.message.includes('New password cannot be the same as the old password')) {
            return res.status(400).json({ message: error.message })
        }
        res.status(500).json({ message: 'Internal server error during password change.' })
    }
}

/**
 * Призначити роль користувачеві
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function assignRoles(req, res, next) {
    try {
        const dbName = req.dbName
        const { id: userId } = req.params
        const { roleIds } = req.body

        // Простенька валідація
        if (
            !Array.isArray(roleIds) ||
            roleIds.length === 0 ||
            !roleIds.every((id) => Number.isInteger(id))
        ) {
            return res
                .status(400)
                .json({ error: '`roleIds` має бути масивом цілих чисел і мати якесь значення' })
        }

        const result = await userService.assignRolesToUser(dbName, userId, roleIds)

        res.status(200).json(result)
    } catch (error) {
        next(error)
    }
}

/**
 * Отримати ролі користувача
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function getUserRoles(req, res, next) {
    try {
        const dbName = req.dbName
        const { id: userId } = req.params

        const result = await userService.getUserRoles(dbName, userId)

        res.status(200).json(result)
    } catch (error) {
        next(error)
    }
}

/**
 * Відкликати ролі користувача
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function revokeUserRoles(req, res, next) {
    try {
        const dbName = req.dbName
        const { id: userId } = req.params
        const { roleIds } = req.body

        // Простенька валідація
        if (
            !Array.isArray(roleIds) ||
            roleIds.length === 0 ||
            !roleIds.every((id) => Number.isInteger(id))
        ) {
            return res
                .status(400)
                .json({ error: '`roleIds` має бути масивом цілих чисел і мати якесь значення' })
        }

        const result = await userService.revokeUserRoles(dbName, userId, roleIds)

        res.status(200).json(result)
    } catch (error) {
        next(error)
    }
}
