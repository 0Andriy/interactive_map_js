// utils/jwt.js
import jwt from 'jsonwebtoken'
import { config } from '../config/index.js'

const jwtSecret = config.jwt.secret
const accessExpiration = `${config.jwt.accessExpirationMinutes}m`
const refreshExpiration = `${config.jwt.refreshExpirationDays}d`

/**
 * Генерує JWT-токен доступу.
 * @param {object} payload - Дані, які будуть закодовані в токен (наприклад, userId, roles).
 * @returns {string} Токен доступу.
 */
export const generateAccessToken = (payload) => {
    return jwt.sign(payload, jwtSecret, { expiresIn: accessExpiration })
}

/**
 * Генерує JWT-токен оновлення (Refresh Token).
 * @param {object} payload - Дані для токена оновлення.
 * @returns {string} Токен оновлення.
 */
export const generateRefreshToken = (payload) => {
    return jwt.sign(payload, jwtSecret, { expiresIn: refreshExpiration })
}

/**
 * Верифікує JWT-токен.
 * @param {string} token - Токен для верифікації.
 * @returns {object} Декодований payload токена.
 * @throws {Error} Якщо токен недійсний або термін дії минув.
 */
export const verifyToken = (token) => {
    return jwt.verify(token, jwtSecret)
}
