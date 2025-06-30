// src/utils/passwordUtils.js
import bcrypt from 'bcrypt'
import logger from './logger.js'

// Кількість "раундів" солі (cost factor). Вищий коефіцієнт робить хешування повільнішим і безпечнішим,
// але вимагає більше обчислювальних ресурсів. Рекомендоване значення - від 10 до 12.
// Для продакшну варто врахувати продуктивність сервера.
const SALT_ROUNDS = 12

/**
 * Хешує сирий пароль за допомогою bcrypt.
 * @param {string} password - Сирий (нехешований) пароль.
 * @returns {Promise<string>} Хешований пароль.
 * @throws {Error} Якщо виникає помилка під час хешування.
 */
export async function hashPassword(password) {
    try {
        // Генеруємо сіль. Сіль - це випадковий рядок даних, який додається до пароля перед хешуванням.
        // Це запобігає атакам "веселкових таблиць" і гарантує, що ідентичні паролі матимуть різні хеші.
        const salt = await bcrypt.genSalt(SALT_ROUNDS)
        // Хешуємо пароль, використовуючи згенеровану сіль.
        // bcrypt автоматично включає сіль у кінцевий хеш, тому зберігати сіль окремо не потрібно.
        const hashedPassword = await bcrypt.hash(password, salt)

        logger.info('Password hashed successfully.')

        return hashedPassword
    } catch (error) {
        logger.error(`Error hashing password: ${error.message}`, { error })
        throw new Error(`Failed to hash password: ${error.message}`)
    }
}

/**
 * Порівнює сирий пароль з хешованим паролем.
 * @param {string} password - Сирий (нехешований) пароль, наданий користувачем.
 * @param {string} hashedPassword - Хешований пароль, збережений у базі даних.
 * @returns {Promise<boolean>} True, якщо паролі збігаються, false, якщо ні.
 * @throws {Error} Якщо виникає помилка під час порівняння.
 */
export async function comparePasswords(password, hashedPassword) {
    try {
        // Порівнюємо сирий пароль з хешованим. bcrypt автоматично витягує сіль з хешованого пароля
        // і використовує її для хешування наданого пароля для порівняння.
        const isMatch = await bcrypt.compare(password, hashedPassword)

        if (!isMatch) {
            logger.warn('Attempted login with incorrect password.')
        } else {
            logger.info('Password comparison successful.')
        }

        return isMatch
    } catch (error) {
        logger.error(`Error comparing passwords: ${error.message}`, { error })
        throw new Error(`Failed to compare passwords: ${error.message}`)
    }
}
