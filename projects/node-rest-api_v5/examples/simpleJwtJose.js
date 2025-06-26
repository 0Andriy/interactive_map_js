// src/utils/jwtUtils.js
import * as jose from 'jose'
import dotenv from 'dotenv'
import winston from 'winston'

dotenv.config() // Завантажуємо змінні оточення

const jwtLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json(),
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/security.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
})

// Перетворюємо секретні ключі з рядків у Uint8Array, як того вимагає jose
const ACCESS_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_ACCESS_TOKEN_SECRET)
const REFRESH_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_TOKEN_SECRET)

const ACCESS_TOKEN_EXPIRATION = process.env.JWT_ACCESS_TOKEN_EXPIRATION || '15m'
const REFRESH_TOKEN_EXPIRATION = process.env.JWT_REFRESH_TOKEN_EXPIRATION || '7d'

/**
 * Генерує Access Token.
 * @param {object} payload - Об'єкт даних, які будуть закодовані в токені (наприклад, userId, roles).
 * @returns {Promise<string>} Згенерований Access Token.
 * @throws {Error} Якщо виникає помилка під час генерації.
 */
export async function generateAccessToken(payload) {
    try {
        const token = await new jose.SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' }) // Використовуємо алгоритм HMAC SHA256
            .setIssuedAt() // Встановлює час видачі токена
            .setExpirationTime(ACCESS_TOKEN_EXPIRATION) // Встановлює термін дії
            .sign(ACCESS_TOKEN_SECRET) // Підписує токен секретним ключем
        jwtLogger.info('Access token generated successfully.', { userId: payload.userId })
        return token
    } catch (error) {
        jwtLogger.error(`Error generating access token: ${error.message}`, { error, payload })
        throw new Error(`Failed to generate access token: ${error.message}`)
    }
}

/**
 * Генерує Refresh Token.
 * @param {object} payload - Об'єкт даних, які будуть закодовані в токені (зазвичай userId).
 * @returns {Promise<string>} Згенерований Refresh Token.
 * @throws {Error} Якщо виникає помилка під час генерації.
 */
export async function generateRefreshToken(payload) {
    try {
        const token = await new jose.SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime(REFRESH_TOKEN_EXPIRATION)
            .sign(REFRESH_TOKEN_SECRET)
        jwtLogger.info('Refresh token generated successfully.', { userId: payload.userId })
        return token
    } catch (error) {
        jwtLogger.error(`Error generating refresh token: ${error.message}`, { error, payload })
        throw new Error(`Failed to generate refresh token: ${error.message}`)
    }
}

/**
 * Перевіряє Access Token.
 * @param {string} token - Access Token для перевірки.
 * @returns {Promise<object>} Декодований payload токена.
 * @throws {Error} Якщо токен недійсний, прострочений або підроблений.
 */
export async function verifyAccessToken(token) {
    try {
        const { payload } = await jose.jwtVerify(token, ACCESS_TOKEN_SECRET)
        jwtLogger.info('Access token verified successfully.', { userId: payload.userId })
        return payload
    } catch (error) {
        jwtLogger.error(`Error verifying access token: ${error.message}`, {
            error,
            token: token.substring(0, 20) + '...',
        })
        if (error instanceof jose.errors.JWTExpired) {
            throw new Error('Access token expired.')
        }
        if (error instanceof jose.errors.JWSInvalid) {
            throw new Error('Invalid access token signature.')
        }
        throw new Error(`Access token verification failed: ${error.message}`)
    }
}

/**
 * Перевіряє Refresh Token.
 * @param {string} token - Refresh Token для перевірки.
 * @returns {Promise<object>} Декодований payload токена.
 * @throws {Error} Якщо токен недійсний, прострочений або підроблений.
 */
export async function verifyRefreshToken(token) {
    try {
        const { payload } = await jose.jwtVerify(token, REFRESH_TOKEN_SECRET)
        jwtLogger.info('Refresh token verified successfully.', { userId: payload.userId })
        return payload
    } catch (error) {
        jwtLogger.error(`Error verifying refresh token: ${error.message}`, {
            error,
            token: token.substring(0, 20) + '...',
        })
        if (error instanceof jose.errors.JWTExpired) {
            throw new Error('Refresh token expired.')
        }
        if (error instanceof jose.errors.JWSInvalid) {
            throw new Error('Invalid refresh token signature.')
        }
        throw new Error(`Refresh token verification failed: ${error.message}`)
    }
}
