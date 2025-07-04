// services/role.service.js
import roleModel from '../models/role.model.js'
import loggerModule from '../../../utils/logger.js'
import CustomError from '../../../utils/СustomError.js'

const logger = loggerModule.getLoggerForService('role-management-service')

class RoleService {
    /**
     * Створити нову роль
     * @param {string} dbName
     * @param {object} roleData
     * @param {string} roleData.name
     * @param {string} [roleData.description]
     * @returns {Promise<Object>}
     */
    async createRole(dbName, roleData) {
        try {
            const existing = await roleModel.findByName(dbName, roleData.name)
            if (existing) {
                throw CustomError.Conflict(`Role with name "${roleData.name}" already exists`, {
                    roleName: roleData.name,
                })
            }

            const newRole = await roleModel.create(dbName, roleData)
            logger.info(`Role created: ${newRole.NAME}`)

            return newRole
        } catch (error) {
            logger.error(`Error creating role: ${error.message}`, { error })
            throw error
        }
    }

    /**
     * Отримати всі ролі
     * @param {string} dbName
     * @returns {Promise<Array>}
     */
    async getAllRoles(dbName) {
        try {
            const roles = await roleModel.findAll(dbName)

            return roles
        } catch (error) {
            logger.error(`Error fetching roles: ${error.message}`, { error })
            throw error
        }
    }

    /**
     * Отримати роль за ID
     * @param {string} dbName
     * @param {number|string} roleId
     * @returns {Promise<Object|null>}
     */
    async getRoleById(dbName, roleId) {
        try {
            const role = await roleModel.findById(dbName, roleId)
            if (!role) {
                throw CustomError.NotFound(`Role with ID "${roleId}" not found`, { roleId })
            }

            return role
        } catch (error) {
            logger.error(`Error fetching role by ID ${roleId}: ${error.message}`, { error })
            throw error
        }
    }

    /**
     * Оновити роль
     * @param {string} dbName
     * @param {number|string} roleId
     * @param {object} updateData
     * @returns {Promise<Object|null>}
     */
    async updateRole(dbName, roleId, updateData) {
        try {
            const updated = await roleModel.update(dbName, roleId, updateData)
            if (!updated) {
                throw CustomError.NotFound(`Role with ID "${roleId}" not found for update`, {
                    roleId,
                })
            }

            const role = await roleModel.findById(dbName, roleId)

            return role
        } catch (error) {
            logger.error(`Error updating role ${roleId}: ${error.message}`, { error })
            throw error
        }
    }

    /**
     * Видалити роль (логічне видалення або фізичне, залежно від реалізації)
     * @param {string} dbName
     * @param {number|string} roleId
     * @returns {Promise<boolean>}
     */
    async deleteRole(dbName, roleId) {
        try {
            const deleted = (await roleModel.softDelete)
                ? await roleModel.softDelete(dbName, roleId)
                : await roleModel.delete(dbName, roleId)

            if (!deleted) {
                throw CustomError.NotFound(`Role with ID "${roleId}" not found for deletion`, {
                    roleId,
                })
            }

            return deleted
        } catch (error) {
            logger.error(`Error deleting role ${roleId}: ${error.message}`, { error })
            throw error
        }
    }
}

export default new RoleService()
