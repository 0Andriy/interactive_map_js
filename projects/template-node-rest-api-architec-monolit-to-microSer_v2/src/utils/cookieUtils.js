// src/utils/cookieUtils.js
import config from '../config/config.js'
import logger from './logger.js'
const tokenTypes = config.tokenTypes

/**
 * Повертає конфігурацію для певного типу токена.
 * @param {('access'|'refresh')} type - Тип токена.
 * @returns {object} Об'єкт конфігурації токена.
 */
function getTokenConfig(type) {
    if (!tokenTypes[type]) {
        throw new Error(`Unknown token type: ${type}`)
    }
    return tokenTypes[type]
}

/**
 * Повертає опції куки для певного типу токена.
 * @param {('access'|'refresh')} type - Тип токена.
 * @returns {import('express').CookieOptions} Опції куки.
 */
function getCookieOptions(type) {
    const config = getTokenConfig(type)
    if (!config.cookie || !config.cookie.options) {
        throw new Error(`Cookie options not defined for token type: ${type}`)
    }
    return config.cookie.options
}

/**
 * Повертає назву куки для певного типу токена.
 * @param {('access'|'refresh')} type - Тип токена.
 * @returns {string} Назва куки.
 */
function getCookieName(type) {
    const config = getTokenConfig(type)
    if (!config.cookie || !config.cookie.name) {
        throw new Error(`Cookie name not defined for token type: ${type}`)
    }
    return config.cookie.name
}

/**
 * Встановлює HTTP-Only куку для токена.
 * @param {import('express').Response} res - Об'єкт відповіді Express.
 * @param {('access'|'refresh')} type - Тип токена ('access' або 'refresh').
 * @param {string} tokenValue - Значення токена, яке потрібно встановити в куку.
 */
export function setTokenCookie(res, type, tokenValue = {}) {
    try {
        const cookieName = getCookieName(type)
        const cookieOptions = getCookieOptions(type)
        res.cookie(cookieName, tokenValue, cookieOptions)

        logger.debug(`Set ${type} token cookie: ${cookieName}`)
    } catch (error) {
        logger.error(`Error setting ${type} token cookie: ${error.message}`, { error })
        throw error
    }
}

/**
 * Видаляє HTTP-Only куку для токена.
 * @param {import('express').Response} res - Об'єкт відповіді Express.
 * @param {('access'|'refresh')} type - Тип токена ('access' або 'refresh').
 */
export function clearTokenCookie(res, type) {
    try {
        const cookieName = getCookieName(type)
        // Для видалення куки потрібні ті ж опції (крім maxAge), з якими її було встановлено.
        // Це забезпечує, що браузер знайде і видалить правильну куку.
        // Важливо: secure та sameSite повинні бути ідентичними.
        const cookieOptions = getCookieOptions(type)

        // Встановлюємо maxAge на 0 або дату в минулому для видалення
        res.clearCookie(cookieName, {
            httpOnly: cookieOptions.httpOnly,
            secure: cookieOptions.secure,
            sameSite: cookieOptions.sameSite,
            path: cookieOptions.path,
        })
        logger.debug(`Cleared ${type} token cookie: ${cookieName}`)
    } catch (error) {
        logger.error(`Error clearing ${type} token cookie: ${error.message}`, { error })
        throw error
    }
}
