// utils/bcrypt.js
import bcrypt from 'bcryptjs'

const saltRounds = 10 // Кількість ітерацій для хешування

/**
 * Хешує рядок (пароль).
 * @param {string} plainText - Рядок для хешування.
 * @returns {Promise<string>} Хеш.
 */
export const hashPassword = async (plainText) => {
    return bcrypt.hash(plainText, saltRounds)
}

/**
 * Порівнює звичайний текст з хешем.
 * @param {string} plainText - Звичайний текст (наприклад, введений пароль).
 * @param {string} hash - Хеш для порівняння.
 * @returns {Promise<boolean>} True, якщо збігаються, false в іншому випадку.
 */
export const comparePassword = async (plainText, hash) => {
    return bcrypt.compare(plainText, hash)
}
