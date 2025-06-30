import userModel from '../models/user.model.js'
import userRoleModel from '../models/userRole.model.js'
// import CustomError from '../../../utils/CustomError.js'
import { hashPassword, comparePasswords } from '../../../utils/passwordUtils.js'
import loggerModule from '../../../utils/logger.js'
const logger = loggerModule.getLoggerForService('user-management-service')

import * as authGateway from '../gateways/auth.gateway.js'

/**
 * @class UserService
 * @description Сервіс для керування користувачами, включаючи створення, пошук, оновлення, видалення (логічне) та призначення ролей.
 * Цей сервіс взаємодіє з моделями `userModel` та `userRoleModel` для виконання операцій з базою даних.
 */
class UserService {
    /**
     * Створює нового користувача в базі даних.
     * Перед створенням перевіряє, чи не існує користувач з таким же ім'ям користувача або електронною поштою.
     *
     * @param {string} dbName - Назва бази даних, з якою працювати.
     * @param {object} userData - Об'єкт, що містить дані користувача для створення.
     * @param {string} userData.username - Унікальне ім'я користувача.
     * @param {string} userData.email - Унікальна електронна пошта користувача.
     * @param {string} userData.password - Пароль користувача (буде хешований моделлю).
     * @returns {Promise<Object>} Об'єкт користувача, який був створений, без хешу пароля та солі.
     * @throws {CustomError.Conflict} Якщо користувач з таким ім'ям користувача або електронною поштою вже існує.
     */
    async createUser(dbName, userData) {
        const exists =
            (await userModel.findByUsername(dbName, userData.username)) ||
            (await userModel.findByEmail(dbName, userData.email))

        if (exists) {
            throw new Error('User already exists')
        }

        const user = await userModel.create(dbName, userData)
        delete user.PASSWORD_HASH
        delete user.SALT

        logger.info(`User created: ${user.username}`)

        return user
    }

    /**
     * Знаходить усіх користувачів з можливістю пагінації, сортування та фільтрації.
     *
     * @param {string} dbName - Назва бази даних, з якою працювати.
     * @param {Object} [options={}] - Об'єкт параметрів для пагінації та фільтрації.
     * @param {number} [options.page=1] - Номер сторінки для пагінації. За замовчуванням 1.
     * @param {number} [options.limit=10] - Максимальна кількість користувачів на сторінці. За замовчуванням 10.
     * @param {string} [options.sortBy='created_at'] - Поле, за яким сортувати результат. За замовчуванням 'created_at'.
     * @param {string} [options.order='DESC'] - Порядок сортування ('ASC' для зростання, 'DESC' для спадання). За замовчуванням 'DESC'.
     * @param {Object} [options.filters={}] - Об'єкт фільтрів, які застосовуються до полів користувача.
     * @param {string} [options.search=''] - Рядок для пошуку користувачів (зазвичай по username або email).
     * @returns {Promise<Array<Object>>} Масив об'єктів користувачів, без хешів паролів та солей.
     */
    async getAllUsers(dbName, options = {}) {
        const {
            page = 1,
            limit = 10,
            sortBy = 'created_at',
            order = 'DESC',
            filters = {},
            search = '',
        } = options

        const offset = (page - 1) * limit

        console.log(11, offset, limit)

        const { users, pagination } = await userModel.findAll(
            dbName,
            {
                limit,
                offset,
                sortBy,
                order,
                filters,
                search,
            },
            false,
            limit,
            offset,
        )

        const sanitizedUsers = users.map((user) => {
            delete user.PASSWORD_HASH
            delete user.SALT

            return user
        })

        return {
            users: sanitizedUsers,
            pagination,
        }
    }

    /**
     * Знаходить користувача за його ідентифікатором.
     *
     * @param {string} dbName - Назва бази даних, з якою працювати.
     * @param {number|string} userId - Ідентифікатор користувача (може бути числом або рядком).
     * @returns {Promise<Object|null>} Об'єкт користувача, якщо знайдено, без хешу пароля та солі; в іншому випадку `null`.
     */
    async getUserById(dbName, userId) {
        const user = await userModel.findById(dbName, userId)
        if (!user) return null

        delete user.PASSWORD_HASH
        delete user.SALT

        return user
    }

    /**
     * Оновлює дані існуючого користувача.
     *
     * @param {string} dbName - Назва бази даних, з якою працювати.
     * @param {number|string} userId - Ідентифікатор користувача для оновлення.
     * @param {Object} updateData - Об'єкт, що містить дані для оновлення.
     * @returns {Promise<Object|null>} Оновлений об'єкт користувача, без хешу пароля та солі, якщо оновлення успішне; в іншому випадку `null`.
     */
    async updateUser(dbName, userId, updateData) {
        const ok = await userModel.update(dbName, userId, updateData)
        if (!ok) return null

        const user = await userModel.findById(dbName, userId)

        delete user.PASSWORD_HASH
        delete user.SALT

        return user
    }

    /**
     * Виконує логічне видалення користувача (встановлює позначку `deleted`).
     *
     * @param {string} dbName - Назва бази даних, з якою працювати.
     * @param {number|string} userId - Ідентифікатор користувача для логічного видалення.
     * @returns {Promise<boolean>} `true`, якщо логічне видалення пройшло успішно; `false` в іншому випадку.
     */
    async softDeleteUser(dbName, userId) {
        return await userModel.softDelete(dbName, userId)
    }

    /**
     * Змінює пароль користувача.
     * @param {string} dbName - Назва бази даних, яка повинна відповідати одному з імен, визначених у файлі конфігурації
     * @param {number} userId - ID користувача.
     * @param {string} newPassword - Новий пароль користувача.
     * @returns {Promise<void>}
     * @throws {Error} Якщо старий пароль невірний або новий пароль такий самий, як старий.
     */
    async adminChangeUserPassword(dbName, userId, newPassword) {
        try {
            const user = await userModel.findById(dbName, userId)
            if (!user) {
                logger.warn(`Change password failed: User ${userId} not found.`)
                throw new Error('User not found.')
            }

            const isNewPasswordSame = await comparePasswords(newPassword, user.PASSWORD_HASH)
            if (isNewPasswordSame) {
                logger.warn(
                    `Change password failed for user ${userId}: New password is same as old.`,
                )
                throw new Error('New password cannot be the same as the old password.')
            }

            const newPasswordHash = await hashPassword(newPassword)
            await userModel.update(dbName, userId, { PASSWORD_HASH: newPasswordHash })

            // Після зміни пароля відкликаємо всі токени користувача для безпеки
            await this.revokeAllUserTokens(dbName, userId)

            logger.info(`Password successfully changed for user ${userId}. All tokens revoked.`)
        } catch (error) {
            logger.error(`Change password service failed for user ${userId}: ${error.message}`, {
                error,
            })
            throw error
        }
    }

    /**
     * Змінює пароль користувача.
     * @param {string} dbName - Назва бази даних, яка повинна відповідати одному з імен, визначених у файлі конфігурації
     * @param {number} userId - ID користувача.
     * @param {string} oldPassword - Поточний пароль користувача.
     * @param {string} newPassword - Новий пароль користувача.
     * @returns {Promise<void>}
     * @throws {Error} Якщо старий пароль невірний або новий пароль такий самий, як старий.
     */
    async changeOwnPassword(dbName, userId, oldPassword, newPassword) {
        try {
            const user = await userModel.findById(dbName, userId)
            if (!user) {
                logger.warn(`Change password failed: User ${userId} not found.`)
                throw new Error('User not found.')
            }

            const isPasswordValid = await comparePasswords(oldPassword, user.PASSWORD_HASH)
            if (!isPasswordValid) {
                logger.warn(`Change password failed for user ${userId}: Invalid old password.`)
                throw new Error('Invalid old password.')
            }

            const isNewPasswordSame = await comparePasswords(newPassword, user.PASSWORD_HASH)
            if (isNewPasswordSame) {
                logger.warn(
                    `Change password failed for user ${userId}: New password is same as old.`,
                )
                throw new Error('New password cannot be the same as the old password.')
            }

            const newPasswordHash = await hashPassword(newPassword)
            await userGateway.update(dbName, userId, { PASSWORD_HASH: newPasswordHash })

            // Після зміни пароля відкликаємо всі токени користувача для безпеки
            await authGateway.revokeAllUserTokens(dbName, userId)

            logger.info(`Password successfully changed for user ${userId}. All tokens revoked.`)
        } catch (error) {
            logger.error(`Change password service failed for user ${userId}: ${error.message}`, {
                error,
            })
            throw error
        }
    }

    /**
     * Призначає одну або декілька ролей користувачу.
     *
     * @param {string} dbName - Назва бази даних, з якою працювати.
     * @param {number|string} userId - Ідентифікатор користувача, якому потрібно призначити ролі.
     * @param {string[]} [roleIds=[]] - Масив ID ролей для призначення.
     * @returns {Promise<Object[]>} Масив результатів операцій призначення ролей.
     * @throws {CustomError.NotFound} Якщо користувача з вказаним `userId` не знайдено.
     */
    async assignRolesToUser(dbName, userId, roleIds = []) {
        try {
            // Спершу шукаємо користувача, щоб впевнитися, що він існує
            const user = await userModel.findById(dbName, userId)

            if (!user) {
                throw CustomError.NotFound('User not found', null, 'USER_NOT_FOUND')
            }

            if (!Array.isArray(roleIds) || roleIds.length === 0) {
                return [] // Нічого не призначати, якщо масив порожній
            }

            // Отримуємо всі ролі, що вже є у користувача
            // Це потрібно, щоб зрозуміти, які ролі активні, які ні, а яких немає
            const currentRoles = await userRoleModel.getRolesForUser(dbName, userId, true)

            const results = []

            // Перебираємо всі ролі, які хочемо призначити
            for (const roleId of roleIds) {
                // Шукаємо, чи є ця роль вже призначена користувачу
                const role = currentRoles.find((r) => r.ROLE_ID === roleId)

                if (role) {
                    if (role.USER_ROLE_IS_ACTIVE) {
                        // Якщо роль активна — нічого не робимо
                        results.push({ roleId, status: 'already_active' })
                    } else {
                        // Якщо роль є, але неактивна — активуємо її
                        await userRoleModel.updateRoleStatusForUser(dbName, userId, roleId, true)
                        results.push({ roleId, status: 'reactivated' })
                    }
                } else {
                    // Якщо ролі немає — додаємо новий запис
                    await userRoleModel.assignRole(dbName, userId, roleId)
                    results.push({ roleId, status: 'assigned' })
                }
            }

            // Логування результату
            logger.info(`Assign roles to user ${userId}: [${roleIds.join(', ')}]`)

            return results
        } catch (error) {
            logger.error(`Error assigning roles to user ${userId}: ${error.message}`, {
                error,
            })
            throw error
        }
    }

    /**
     * Отримує ролі користувача.
     *
     * @param {string} dbName - Назва бази даних.
     * @param {number|string} userId - Ідентифікатор користувача.
     * @returns {Promise<Object[]>} Масив ролей користувача з інформацією про їх статус.
     * @throws {CustomError.NotFound} Якщо користувача з вказаним `userId` не знайдено.
     */
    async getUserRoles(dbName, userId) {
        try {
            // Перевіряємо чи існує користувач
            const user = await userModel.findById(dbName, userId)

            if (!user) {
                throw CustomError.NotFound('User not found', null, 'USER_NOT_FOUND')
            }

            // Отримуємо ролі користувача (припускаємо, що параметр true означає, що беремо всі ролі, включно з неактивними)
            const currentUserRoles = await userRoleModel.getRolesForUser(dbName, userId, true)

            // Логування
            logger.info(`Fetched roles for user ${userId}`)

            return currentUserRoles
        } catch (error) {
            logger.error(`Error fetching roles for user ${userId}: ${error.message}`, { error })
            throw error
        }
    }

    /**
     * Відкликає одну або декілька ролей у користувача (деактивує).
     *
     * @param {string} dbName - Назва бази даних, з якою працювати.
     * @param {number|string} userId - Ідентифікатор користувача, у якого потрібно відкликати ролі.
     * @param {string[]} [roleIds=[]] - Масив ID ролей для відкликання.
     * @returns {Promise<Object[]>} Масив результатів операцій відкликання ролей.
     * @throws {CustomError.NotFound} Якщо користувача з вказаним `userId` не знайдено.
     */
    async revokeUserRoles(dbName, userId, roleIds = []) {
        try {
            // Спершу шукаємо користувача, щоб впевнитися, що він існує
            const user = await userModel.findById(dbName, userId)

            if (!user) {
                throw CustomError.NotFound('User not found', null, 'USER_NOT_FOUND')
            }

            if (!Array.isArray(roleIds) || roleIds.length === 0) {
                return [] // Нічого не відкликати, якщо масив порожній
            }

            // Отримуємо всі ролі користувача, включно з активними та неактивними
            const currentRoles = await userRoleModel.getRolesForUser(dbName, userId, true)

            const results = []

            // Перебираємо ролі, які потрібно відкликати
            for (const roleId of roleIds) {
                // Шукаємо, чи призначена ця роль користувачу
                const role = currentRoles.find((r) => r.ROLE_ID === roleId)

                if (role) {
                    if (!role.USER_ROLE_IS_ACTIVE) {
                        // Якщо роль вже неактивна — нічого не робимо
                        results.push({ roleId, status: 'already_inactive' })
                    } else {
                        // Якщо роль активна — деактивуємо
                        await userRoleModel.updateRoleStatusForUser(dbName, userId, roleId, false)
                        results.push({ roleId, status: 'revoked' })
                    }
                } else {
                    // Якщо роль не призначена користувачу — нічого не робимо або можна записати у результат
                    results.push({ roleId, status: 'not_assigned' })
                }
            }

            // Логування результату
            logger.info(`Revoked roles from user ${userId}: [${roleIds.join(', ')}]`)

            return results
        } catch (error) {
            logger.error(`Error revoking roles for user ${userId}: ${error.message}`, { error })
            throw error
        }
    }
}

export default new UserService()
