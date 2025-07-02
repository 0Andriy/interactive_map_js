import roleService from '../services/role.service.js'
import loggerModule from '../../../utils/logger.js'
import CustomError from '../../../utils/СustomError.js'

const logger = loggerModule.getLoggerForService('role-management-service')

/**
 * Створити нову роль
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function createRole(req, res, next) {
    try {
        const dbName = req.dbName
        const { name } = req.body

        if (!name) {
            // Використовуємо CustomError для валідації
            throw CustomError.BadRequest('Role name is required')
        }

        const role = await roleService.createRole(dbName, name)

        return res.status(201).json({
            message: 'Role created successfully',
            role,
        })
    } catch (error) {
        logger.error(`Create role error: ${error.message}`, { error })
        next(error)
    }
}

/**
 * Отримати всі ролі
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function getAllRoles(req, res, next) {
    try {
        const dbName = req.dbName

        const roles = await roleService.getAllRoles(dbName)

        return res.status(200).json({
            message: 'Roles retrieved successfully',
            results: roles.length,
            roles,
        })
    } catch (error) {
        logger.error(`Get all roles error: ${error.message}`, { error })
        next(error)
    }
}

/**
 * Отримати роль за ID
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function getRoleById(req, res, next) {
    try {
        const dbName = req.dbName
        const { id } = req.params

        const role = await roleService.getRoleById(dbName, id)

        return res.status(200).json({
            message: 'Role retrieved successfully',
            role,
        })
    } catch (error) {
        logger.error(`Get role by ID error: ${error.message}`, { error })
        next(error)
    }
}

/**
 * Оновити роль
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function updateRole(req, res, next) {
    try {
        const dbName = req.dbName
        const { id } = req.params
        const { name: role_name } = req.body

        const updatedRole = await roleService.updateRole(dbName, id, { role_name })

        return res.status(200).json({
            message: 'Role updated successfully',
            role: updatedRole,
        })
    } catch (error) {
        logger.error(`Update role error: ${error.message}`, { error })
        next(error)
    }
}

/**
 * Видалити роль
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function deleteRole(req, res, next) {
    try {
        const dbName = req.dbName
        const { id } = req.params

        const deleted = await roleService.deleteRole(dbName, id)

        // res.status(204).send()
        return res.status(200).json({
            message: 'Role deleted successfully',
        })
    } catch (error) {
        logger.error(`Delete role error: ${error.message}`, { error })
        next(error)
    }
}
