// src/utils/tokenUtils.js
import crypto from 'crypto'
import logger from './logger'

/**
 * Генерує криптографічно стійкий випадковий токен у форматі hex.
 * @param {number} bytes - Кількість байтів для генерації (наприклад, 32 байти дадуть 64 символи hex).
 * @returns {Promise<string>} Випадковий hex-рядок.
 */
export async function generateRandomToken(bytes = 32) {
    return new Promise((resolve, reject) => {
        crypto.randomBytes(bytes, (err, buffer) => {
            if (err) {
                logger.error(`Error generating random token: ${err.message}`, {
                    error: err,
                })
                return reject(new Error('Failed to generate secure token.'))
            }
            const token = buffer.toString('hex')
            logger.debug('Random token generated successfully.')
            resolve(token)
        })
    })
}
