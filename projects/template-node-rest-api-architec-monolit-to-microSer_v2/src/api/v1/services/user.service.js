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

        const { users, pagination } = await userModel.findAll(dbName, {
            limit,
            offset,
            sortBy,
            order,
            filters,
            search,
        })

        users = users.map((user) => {
            delete user.PASSWORD_HASH
            delete user.SALT

            return user
        })

        return {
            users,
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
     * @param {string[]} [roles=[]] - Масив рядків, де кожен рядок є назвою ролі для призначення.
     * @returns {Promise<Object[]>} Масив результатів операцій призначення ролей.
     * @throws {CustomError.NotFound} Якщо користувача з вказаним `userId` не знайдено.
     */
    async assignRolesToUser(dbName, userId, roles = []) {
        const user = await userModel.findById(dbName, userId)

        if (!user) {
            throw CustomError.NotFound('User not found', null, 'USER_NOT_FOUND')
        }

        const results = await Promise.all(
            roles.map((roleName) => userRoleModel.assignRole(dbName, userId, roleName)),
        )

        logger.info(`Assign roles to user ${userId}: [${roles.join(', ')}]`)

        return results
    }
}

export default new UserService()
