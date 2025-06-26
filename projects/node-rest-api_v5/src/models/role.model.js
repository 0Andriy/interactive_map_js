// src/models/role.model.js
import oracleDbManager from '../db/OracleDbManager.js'
import logger from '../utils/logger.js'

class RoleModel {
    /**
     * Створює нову роль.
     * @param {string} roleName - Назва ролі.
     * @param {string} [description=null] - Опис ролі.
     * @returns {Promise<object>} Об'єкт створеної ролі.
     * @throws {Error} Якщо виникає помилка при створенні (наприклад, дублікат roleName).
     */
    async create(dbName, roleName, description = null) {
        try {
            const sql = `
                INSERT INTO ROLES (ROLE_NAME, DESCRIPTION)
                VALUES (:roleName, :description)
                RETURNING ROLE_ID, ROLE_NAME, DESCRIPTION, CREATED_AT, UPDATED_AT INTO
                    :out_roleId, :out_roleName, :out_description, :out_createdAt, :out_updatedAt
            `

            const binds = {
                roleName,
                description: description || null,
                out_roleId: {
                    type: oracleDbManager.oracledb.NUMBER,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_roleName: {
                    type: oracleDbManager.oracledb.STRING,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_description: {
                    type: oracleDbManager.oracledb.STRING,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_createdAt: {
                    type: oracleDbManager.oracledb.DATE,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_updatedAt: {
                    type: oracleDbManager.oracledb.DATE,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
            }

            const options = { autoCommit: true }

            const result = await oracleDbManager.execute(dbName, sql, binds, options)
            const outBinds = result.outBinds

            return {
                roleId: outBinds.out_roleId[0],
                roleName: outBinds.out_roleName[0],
                description: outBinds.out_description[0],
                createdAt: outBinds.out_createdAt[0],
                updatedAt: outBinds.out_updatedAt[0],
            }
        } catch (error) {
            logger.error(`Error creating role '${roleName}': ${error.message}`, { error })
            if (error.oracleErrorNum === 1 && error.message.includes('ROLES_ROLE_NAME_UK')) {
                throw new Error('Role name already exists.')
            }
            throw error
        }
    }

    /**
     * Отримує роль за ID.
     * @param {number} roleId - ID ролі.
     * @returns {Promise<object|null>} Об'єкт ролі або null.
     * @throws {Error} Якщо виникає помилка при пошуку.
     */
    async findById(dbName, roleId) {
        try {
            const sql = `
                SELECT ROLE_ID, ROLE_NAME, DESCRIPTION, CREATED_AT, UPDATED_AT
                FROM ROLES
                WHERE ROLE_ID = :roleId
            `

            const binds = { roleId }

            const result = await oracleDbManager.execute(dbName, sql, binds)

            return result.rows.length > 0 ? result.rows[0] : null
        } catch (error) {
            logger.error(`Error finding role by ID ${roleId}: ${error.message}`, { error })
            throw error
        }
    }

    /**
     * Отримує роль за назвою.
     * @param {string} roleName - Назва ролі.
     * @returns {Promise<object|null>} Об'єкт ролі або null.
     * @throws {Error} Якщо виникає помилка при пошуку.
     */
    async findByName(dbName, roleName) {
        try {
            const sql = `
                SELECT ROLE_ID, ROLE_NAME, DESCRIPTION, CREATED_AT, UPDATED_AT
                FROM ROLES
                WHERE ROLE_NAME = :roleName
            `

            const binds = { roleName }

            const result = await oracleDbManager.execute(dbName, sql, binds)

            return result.rows.length > 0 ? result.rows[0] : null
        } catch (error) {
            logger.error(`Error finding role by name '${roleName}': ${error.message}`, {
                error,
            })
            throw error
        }
    }

    /**
     * Отримує всі ролі.
     * @returns {Promise<Array<object>>} Масив об'єктів ролей.
     * @throws {Error} Якщо виникає помилка при отриманні списку.
     */
    async getAll(dbName) {
        try {
            const sql = `
                SELECT ROLE_ID, ROLE_NAME, DESCRIPTION, CREATED_AT, UPDATED_AT
                FROM ROLES
                ORDER BY ROLE_NAME
            `

            const result = await oracleDbManager.execute(dbName, sql)

            return result.rows
        } catch (error) {
            logger.error(`Error getting all roles: ${error.message}`, { error })
            throw error
        }
    }

    /**
     * Оновлює роль.
     * @param {number} roleId - ID ролі.
     * @param {object} updates - Об'єкт з полями для оновлення.
     * @returns {Promise<boolean>} True, якщо оновлено, false, якщо ні.
     * @throws {Error} Якщо виникає помилка при оновленні.
     */
    async update(dbName, roleId, updates) {
        try {
            const setClauses = []
            const binds = { roleId }

            setClauses.push('UPDATED_AT = SYSTIMESTAMP')

            for (const key in updates) {
                if (
                    updates.hasOwnProperty(key) &&
                    ['ROLE_NAME', 'DESCRIPTION'].includes(key.toUpperCase())
                ) {
                    setClauses.push(`${key.toUpperCase()} = :${key}`)
                    binds[key] = updates[key]
                }
            }

            if (setClauses.length === 0) {
                logger.warn(`No updatable fields provided for role ${roleId}`)
                return false
            }

            const sql = `
                UPDATE ROLES
                SET ${setClauses.join(', ')}
                WHERE ROLE_ID = :roleId
            `

            const result = await oracleDbManager.execute(dbName, sql, binds, { autoCommit: true })

            if (result.rowsAffected === 1) {
                logger.info(`Role ${roleId} updated successfully.`)
            } else {
                logger.warn(`Role ${roleId} not updated (not found or no changes).`)
            }

            return result.rowsAffected === 1
        } catch (error) {
            logger.error(`Error updating role ${roleId}: ${error.message}`, {
                error,
                updates,
            })
            if (error.oracleErrorNum === 1 && error.message.includes('ROLES_ROLE_NAME_UK')) {
                throw new Error('Role name already exists.')
            }
            throw error
        }
    }

    /**
     * Видаляє роль (фізично).
     * @param {number} roleId - ID ролі.
     * @returns {Promise<boolean>} True, якщо видалено, false, якщо ні.
     * @throws {Error} Якщо виникає помилка при видаленні.
     */
    async delete(dbName, roleId) {
        try {
            const sql = `
                DELETE FROM ROLES
                WHERE ROLE_ID = :roleId
            `

            const binds = { roleId }

            const result = await oracleDbManager.execute(dbName, sql, binds, { autoCommit: true })

            if (result.rowsAffected === 1) {
                logger.info(`Role ${roleId} deleted successfully.`)
            } else {
                logger.warn(`Role ${roleId} not deleted (not found).`)
            }

            return result.rowsAffected === 1
        } catch (error) {
            logger.error(`Error deleting role ${roleId}: ${error.message}`, { error })
            // ORA-02292: integrity constraint (SCHEMA.FK_USER_ROLES_ROLE) violated - child record found
            if (error.oracleErrorNum === 2292) {
                throw new Error('Cannot delete role: it is assigned to one or more users.')
            }
            throw error
        }
    }
}

export default new RoleModel()
