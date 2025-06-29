import * as userService from '../services/user.service.js'
import { AppError } from '../../../utils/AppError.js'

/**
 * Отримати профіль поточного користувача ('/me')
 */
export const getMe = async (req, res, next) => {
    try {
        // ID користувача додається в req.user мідлвером authenticateToken
        const user = await userService.findUserById(req.user.userId)
        if (!user) {
            return next(new AppError('User not found', 404))
        }
        res.status(200).json(user)
    } catch (error) {
        next(error)
    }
}

/**
 * Отримати користувача за ID
 */
export const getUserById = async (req, res, next) => {
    try {
        const user = await userService.findUserById(req.params.id)
        if (!user) {
            return next(new AppError('User with this ID not found', 404))
        }
        res.status(200).json(user)
    } catch (error) {
        next(error)
    }
}

/**
 * Отримати всіх користувачів
 */
export const getAllUsers = async (req, res, next) => {
    try {
        const { page, limit } = req.query
        const users = await userService.findAllUsers({ page, limit })
        res.status(200).json({
            status: 'success',
            results: users.length,
            data: {
                users,
            },
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Оновити дані користувача
 */
export const updateUser = async (req, res, next) => {
    try {
        const userIdToUpdate = req.params.id
        const { userId, roles } = req.user

        // Користувач може редагувати тільки свій профіль, якщо він не адміністратор
        if (userIdToUpdate !== userId.toString() && !roles.includes('admin')) {
            return next(new AppError('You do not have permission to perform this action', 403))
        }

        // Адміністратор може змінювати поле isActive, користувач - ні
        if (req.body.isActive !== undefined && !roles.includes('admin')) {
            delete req.body.isActive
        }

        const updatedUser = await userService.updateUser(userIdToUpdate, req.body)
        if (!updatedUser) {
            return next(new AppError('User not found or could not be updated', 404))
        }

        res.status(200).json({
            status: 'success',
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
 */
export const deleteUser = async (req, res, next) => {
    try {
        const userIdToDelete = req.params.id
        const { userId, roles } = req.user

        // Користувач може видалити тільки свій профіль, якщо він не адміністратор
        if (userIdToDelete !== userId.toString() && !roles.includes('admin')) {
            return next(new AppError('You do not have permission to perform this action', 403))
        }

        const success = await userService.softDeleteUser(userIdToDelete)
        if (!success) {
            return next(new AppError('User not found', 404))
        }

        res.status(204).send() // 204 No Content
    } catch (error) {
        next(error)
    }
}

/**
 * Призначити роль користувачеві
 */
export const assignRole = async (req, res, next) => {
    try {
        const { id: userId } = req.params
        const { roleName } = req.body

        const result = await userService.assignRoleToUser(userId, roleName)
        res.status(200).json(result)
    } catch (error) {
        if (error.message.includes('not found')) {
            return next(new AppError(error.message, 404))
        }
        next(error)
    }
}
