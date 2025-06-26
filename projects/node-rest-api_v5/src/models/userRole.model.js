// src/models/userRole.model.js
import oracleDbManager from '../db/OracleDbManager.js'
import logger from '../utils/logger.js'

class UserRoleModel {
    /**
     * Призначає роль користувачеві.
     * @param {number} userId - ID користувача.
     * @param {number} roleId - ID ролі.
     * @returns {Promise<object>} Об'єкт призначеної ролі.
     * @throws {Error} Якщо виникає помилка при призначенні (наприклад, дублікат або неіснуючі ID).
     */
    async assignRole(dbName, userId, roleId) {
        try {
            const sql = `
                INSERT INTO USER_ROLES (USER_ID, ROLE_ID)
                VALUES (:userId, :roleId)
                RETURNING USER_ROLE_ID, USER_ID, ROLE_ID, ASSIGNED_AT, IS_ACTIVE INTO
                    :out_userRoleId, :out_userId, :out_roleId, :out_assignedAt, :out_isActive
            `

            const binds = {
                userId,
                roleId,
                out_userRoleId: {
                    type: oracleDbManager.oracledb.NUMBER,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_userId: {
                    type: oracleDbManager.oracledb.NUMBER,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_roleId: {
                    type: oracleDbManager.oracledb.NUMBER,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_assignedAt: {
                    type: oracleDbManager.oracledb.DATE,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
                out_isActive: {
                    type: oracleDbManager.oracledb.NUMBER,
                    dir: oracleDbManager.oracledb.BIND_OUT,
                },
            }

            const options = { autoCommit: true }

            const result = await oracleDbManager.execute(dbName, sql, binds, options)
            const outBinds = result.outBinds

            logger.info(`Role ${roleId} assigned to user ${userId} successfully.`)

            return {
                userRoleId: outBinds.out_userRoleId[0],
                userId: outBinds.out_userId[0],
                roleId: outBinds.out_roleId[0],
                assignedAt: outBinds.out_assignedAt[0],
                isActive: outBinds.out_isActive[0] === 1,
            }
        } catch (error) {
            logger.error(`Error assigning role ${roleId} to user ${userId}: ${error.message}`, {
                error,
            })
            if (error.oracleErrorNum === 1 && error.message.includes('UK_USER_ROLES')) {
                throw new Error('User already has this role assigned.')
            }
            if (error.oracleErrorNum === 2291) {
                // ORA-02291: integrity constraint violated - parent key not found
                throw new Error('User or role does not exist.')
            }
            throw error
        }
    }

    /**
     * Відкликає роль у користувача (видаляє запис з USER_ROLES).
     * @param {number} userId - ID користувача.
     * @param {number} roleId - ID ролі.
     * @returns {Promise<boolean>} True, якщо відкликано, false, якщо ні.
     * @throws {Error} Якщо виникає помилка при відкликанні.
     */
    async revokeRole(dbName, userId, roleId) {
        try {
            const sql = `
                DELETE FROM USER_ROLES
                WHERE USER_ID = :userId AND ROLE_ID = :roleId
            `

            const binds = { userId, roleId }

            const result = await oracleDbManager.execute(dbName, sql, binds, { autoCommit: true })

            if (result.rowsAffected === 1) {
                logger.info(`Role ${roleId} revoked from user ${userId} successfully.`)
            } else {
                logger.warn(`Role ${roleId} not revoked from user ${userId} (not found).`)
            }

            return result.rowsAffected === 1
        } catch (error) {
            logger.error(`Error revoking role ${roleId} from user ${userId}: ${error.message}`, {
                error,
            })
            throw error
        }
    }

    /**
     * Перевіряє, чи має користувач певну роль.
     * @param {number} userId - ID користувача.
     * @param {string} roleName - Назва ролі.
     * @returns {Promise<boolean>} True, якщо має роль, false, якщо ні.
     * @throws {Error} Якщо виникає помилка при перевірці.
     */
    async hasRole(dbName, userId, roleName) {
        try {
            const sql = `
                SELECT COUNT(UR.USER_ROLE_ID) AS COUNT
                FROM USER_ROLES UR
                JOIN ROLES R ON UR.ROLE_ID = R.ROLE_ID
                WHERE UR.USER_ID = :userId AND R.ROLE_NAME = :roleName AND UR.IS_ACTIVE = 1
            `

            const binds = { userId, roleName }

            const result = await oracleDbManager.execute(dbName, sql, binds)

            return result.rows[0].COUNT > 0
        } catch (error) {
            logger.error(`Error checking role '${roleName}' for user ${userId}: ${error.message}`, {
                error,
            })
            throw error
        }
    }

    /**
     * Отримує всі ролі для конкретного користувача.
     * @param {number} userId - ID користувача.
     * @param {boolean} [includeInactive=false] - Чи включати неактивні ролі.
     * @returns {Promise<Array<object>>} Масив об'єктів ролей.
     * @throws {Error} Якщо виникає помилка при отриманні ролей.
     */
    async getRolesForUser(dbName, userId, includeInactive = false) {
        try {
            const sql = `
                SELECT R.ROLE_ID, R.ROLE_NAME, R.DESCRIPTION, UR.ASSIGNED_AT, UR.IS_ACTIVE AS USER_ROLE_IS_ACTIVE
                FROM USER_ROLES UR
                JOIN ROLES R ON UR.ROLE_ID = R.ROLE_ID
                WHERE UR.USER_ID = :userId
                ${includeInactive ? '' : 'AND UR.IS_ACTIVE = 1'}
                ORDER BY R.ROLE_NAME
            `

            const binds = { userId }

            const result = await oracleDbManager.execute(dbName, sql, binds)

            return result.rows.map((row) => ({
                roleId: row.ROLE_ID,
                roleName: row.ROLE_NAME,
                description: row.DESCRIPTION,
                assignedAt: row.ASSIGNED_AT,
                isActive: row.USER_ROLE_IS_ACTIVE === 1, // Конвертуємо в boolean
            }))
        } catch (error) {
            logger.error(`Error getting roles for user ${userId}: ${error.message}`, {
                error,
            })
            throw error
        }
    }

    /**
     * Змінює активність певної ролі для користувача.
     * @param {number} userId - ID користувача.
     * @param {number} roleId - ID ролі.
     * @param {boolean} isActive - Новий статус активності.
     * @returns {Promise<boolean>} True, якщо оновлено, false, якщо ні.
     * @throws {Error} Якщо виникає помилка при зміні статусу.
     */
    async updateRoleStatusForUser(dbName, userId, roleId, isActive) {
        try {
            const sql = `
                UPDATE USER_ROLES
                SET IS_ACTIVE = :isActive, ASSIGNED_AT = SYSTIMESTAMP -- Оновлюємо assigned_at при зміні статусу
                WHERE USER_ID = :userId AND ROLE_ID = :roleId
            `

            const binds = { userId, roleId, isActive: isActive ? 1 : 0 }

            const result = await oracleDbManager.execute(dbName, sql, binds, { autoCommit: true })

            if (result.rowsAffected === 1) {
                logger.info(
                    `Role status for user ${userId}, role ${roleId} updated to ${isActive}.`,
                )
            } else {
                logger.warn(
                    `Role status for user ${userId}, role ${roleId} not updated (not found).`,
                )
            }

            return result.rowsAffected === 1
        } catch (error) {
            logger.error(
                `Error updating role status for user ${userId}, role ${roleId}: ${error.message}`,
                { error },
            )
            throw error
        }
    }
}

export default new UserRoleModel()
