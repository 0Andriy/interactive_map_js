/**
 * @file Express middleware for HTTP request logging using Morgan and a custom Winston logger.
 */

import morgan from 'morgan'
import logger from '../utils/logger.js' // Assuming '../utils/logger.js' exports a Winston logger instance

/**
 * Custom Morgan middleware for logging HTTP requests.
 *
 * This middleware formats incoming HTTP request information into a structured JSON object.
 * It captures standard request details (e.g., method, URL, status, response time)
 * and additionally includes user context information if available on `req.logUserContext`.
 *
 * The formatted log entry is then written to a custom logger (Winston in this case)
 * with an `http` severity level.
 *
 * @param {object} tokens - Morgan's token function for extracting request properties.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {string} A JSON string representing the structured log data for the request.
 */
const morganMiddleware = morgan(
    function (tokens, req, res) {
        // Add user information from req.logUserContext
        const userContext = req.logUserContext || {} // Ensure the object exists

        return JSON.stringify({
            // --- СТАНДАРТНА ІНФОРМАЦІЯ ПРО ВІДПОВІДЬ ---
            remote_address: tokens['remote-addr'](req, res), // Client's IP address
            remote_user: tokens['remote-user'](req, res), // Username (if available)
            // date: tokens['date'](req, res, 'iso'),         // Date in ISO format
            method: tokens.method(req, res), // HTTP method
            url: tokens.url(req, res), // Request URL
            http_version: tokens['http-version'](req, res), // HTTP version
            status: tokens.status(req, res), // Response status code
            content_length: tokens.res(req, res, 'content-length'), // Response size
            referrer: tokens.referrer(req, res), // Referrer URL
            user_agent: tokens['user-agent'](req, res), // Browser information
            response_time: `${tokens['response-time'](req, res)} ms`, // Request processing time

            // --- ДОДАНІ ДЕТАЛІ ЗАПИТУ ---
            headers: req.headers || {}, // Заголовки
            query: req.query || {}, // Query параметри
            body: req.body || {}, // Тіло запиту

            // --- ІНФОРМАЦІЯ ПРО КОРИСТУВАЧА ---
            user: userContext,
            user_id: userContext.userId || userContext.id, // Підтримка userId або просто id
            user_roles: userContext.userRoles || userContext.roles,
            token_source: userContext.tokenSource,
        })
    },
    {
        stream: {
            // Configure Morgan to use our custom logger with the http severity
            write: (message) => {
                const data = JSON.parse(message.trim())
                logger.http(`incoming-request`, data)

                // const formattedString = Object.entries(data)
                //     .map(([key, value]) => `${key}: ${value}`)
                //     .join(' | ');

                // config.logger.http(formattedString.trim())
            },
        },
    },
)

export default morganMiddleware
