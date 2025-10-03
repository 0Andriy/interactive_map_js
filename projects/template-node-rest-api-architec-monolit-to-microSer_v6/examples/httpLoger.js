/**
 * @file Express middleware for HTTP request logging using Morgan and a custom Winston logger.
 */

import morgan from 'morgan'
import logger from '../utils/logger.js' // Assuming '../utils/logger.js' exports a Winston logger instance

/**
 * Helper function to safely extract and filter sensitive fields from the request body.
 * @param {object} body - The request body object (should be available after body-parser runs).
 * @returns {object} The filtered body object with sensitive data redacted.
 */
const filterSensitiveBody = (body) => {
    if (!body || typeof body !== 'object') {
        return {}
    }
    const safeBody = { ...body }
    // !!! ДОДАЙТЕ ВСІ ЧУТЛИВІ ПОЛЯ, ЯКІ ПОТРЕБУЮТЬ ФІЛЬТРАЦІЇ !!!
    const sensitiveFields = [
        'password',
        'oldPassword',
        'newPassword',
        'token',
        'secret',
        'cc_number',
    ]

    for (const field of sensitiveFields) {
        if (safeBody[field]) {
            safeBody[field] = '[FILTERED]'
        }
    }
    return safeBody
}

/**
 * Custom Morgan middleware for logging HTTP requests with detailed request data (headers, query, body, user).
 * * Цей логер має бути розміщений в Express:
 * 1. Після body-parser (щоб мати доступ до req.body).
 * 2. Після middleware автентифікації (щоб мати доступ до req.user або req.logUserContext).
 *
 * @param {object} tokens - Morgan's token function for extracting request properties.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {string} A JSON string representing the structured log data for the request.
 */
const morganMiddleware = morgan(
    function (tokens, req, res) {
        // Використовуємо req.logUserContext, але підтримуємо і стандартний req.user
        const userContext = req.logUserContext || req.user || {}

        // 1. Фільтрація body та headers для безпеки
        const filteredBody = filterSensitiveBody(req.body)
        const safeHeaders = { ...req.headers }

        // Фільтруємо токен авторизації
        if (safeHeaders.authorization) {
            safeHeaders.authorization = '[FILTERED]'
        }

        return JSON.stringify({
            // --- СТАНДАРТНА ІНФОРМАЦІЯ ПРО ВІДПОВІДЬ ---
            remote_address: tokens['remote-addr'](req, res), // Client's IP address
            remote_user: tokens['remote-user'](req, res), // Username (якщо є)
            method: tokens.method(req, res), // HTTP method
            url: tokens.url(req, res), // Request URL
            http_version: tokens['http-version'](req, res), // HTTP version
            status: tokens.status(req, res), // Response status code
            content_length: tokens.res(req, res, 'content-length'), // Response size
            referrer: tokens.referrer(req, res), // Referrer URL
            user_agent: tokens['user-agent'](req, res), // Browser information
            response_time: `${tokens['response-time'](req, res)} ms`, // Request processing time

            // --- ДОДАНІ ДЕТАЛІ ЗАПИТУ ---
            headers: safeHeaders, // Відфільтровані заголовки
            query: req.query || {}, // Query параметри
            body: filteredBody, // Відфільтроване тіло запиту

            // --- ІНФОРМАЦІЯ ПРО КОРИСТУВАЧА ---
            user_id: userContext.userId || userContext.id, // Підтримка userId або просто id
            user_roles: userContext.userRoles || userContext.roles,
            token_source: userContext.tokenSource,
        })
    },
    {
        stream: {
            // Configure Morgan to use our custom logger with the http severity
            write: (message) => {
                try {
                    const data = JSON.parse(message.trim())
                    // Логуємо як http-рівень у Winston
                    logger.http(`incoming-request`, data)
                } catch (error) {
                    logger.error(`Failed to parse Morgan log message: ${error.message}`, {
                        raw_message: message.trim(),
                    })
                }
            },
        },
    },
)

export default morganMiddleware
