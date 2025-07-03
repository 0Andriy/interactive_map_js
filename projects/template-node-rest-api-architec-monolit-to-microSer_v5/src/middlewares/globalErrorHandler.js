/**
 * @file Global error handling middleware for Express applications.
 */

import logger from '../utils/logger.js' // Assuming '../utils/logger.js' exports a Winston logger instance
import CustomError from '../utils/СustomError.js'

/**
 * Global error handling middleware.
 *
 * This middleware catches all errors that occur during the request-response cycle.
 * It performs the following actions:
 * 1. **Logs comprehensive error details:** It logs the error message, stack trace,
 * name, status code, and any custom error properties.
 * 2. **Logs request details:** It includes relevant request information such as
 * method, URL, IP address, parameters, and query string for better debugging.
 * 3. **Logs user details (if available):** If `req.user` is populated (e.g., by
 * an authentication middleware), it logs the user's ID and email (sensitive
 * data should be handled carefully).
 * 4. **Sets response status and message:** It sets the HTTP status code for the
 * response (defaults to 500 Internal Server Error) and provides a user-friendly
 * error message.
 * 5. **Sends JSON error response:** It sends a JSON response to the client
 * containing the status code, status, and message. **Crucially, it avoids
 * sending sensitive error details like the stack trace to the client in
 * production environments.**
 *
 * @param {Error} err - The error object caught by the middleware.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The next middleware function in the stack (not typically called in a global error handler that sends a response).
 * @returns {void}
 */
function globalErrorHandler(err, req, res, next) {
    // Якщо це не CustomError — конвертуємо
    const isCustom = err instanceof CustomError
    const error = isCustom ? err : CustomError.from(err)

    // ==== 1. Журналювання ====
    logger.error({
        message: error.message,
        name: error.name,
        statusCode: error.statusCode,
        code: error.code,
        stack: error.stack,
        meta: error.meta || null,
        errors: error.errors,
        originalError: error.originalError
            ? {
                  message: error.originalError.message,
                  stack: error.originalError.stack,
                  name: error.originalError.name,
              }
            : null,

        // 2. Log request details
        request: {
            method: req.method,
            url: req.originalUrl,
            // headers: req.headers, // Be careful with sensitive data! Can be filtered.
            ip: req.ip,
            params: req.params,
            query: req.query,
            // body: req.body, // Be careful with sensitive data! Sanitize or don't log.
        },

        // 3. Log user details (if available)
        user: req.user
            ? {
                  id: req.user.id,
                  email: req.user.email,
              }
            : null,

        // 4. Other contextual data
        // correlationId: req.headers['x-correlation-id'] || generateUniqueId(), // For request tracing
    })

    // ==== 2. Формування відповіді ====
    // В продакшені — без stack, originalError, errors (якщо хочеш)
    const responsePayload = error.toResponseJSON()

    if (process.env.NODE_ENV === 'development') {
        // Додатково даємо стек та оригінальну помилку
        responsePayload.stack = error.stack
        if (error.originalError) {
            responsePayload.originalError = {
                message: error.originalError.message,
                stack: error.originalError.stack,
            }
        }
        // Можна також додати errors для детального дебагу
        if (error.errors && error.errors.length > 0) {
            responsePayload.errors = error.errors
        }
    }

    res.status(error.statusCode).json(responsePayload)
}

export default globalErrorHandler
