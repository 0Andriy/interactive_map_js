/**
 * @file Global error handling middleware for Express applications.
 */

import logger from '../logger/logger.js'
import CustomError from '../utils/CustomError.js'

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
export function globalErrorHandler(err, req, res, next) {
    // 1. Якщо відповідь уже почала відправлятися клієнту, передаємо помилку стандартному обробнику Express.
    // Це запобігає помилці [ERR_HTTP_HEADERS_SENT]
    if (res.headersSent) {
        return next(err)
    }

    // 2. Нормалізація помилки: переконуємося, що працюємо з екземпляром CustomError
    const isCustom = err instanceof CustomError
    const error = isCustom ? err : CustomError.from(err)

    // 3. Формування об'єкта для логування
    // Використовуємо req.logger, якщо він доданий через middleware, інакше стандартний
    const logWriter = req.logger || logger

    // 3. Журналювання (використовуємо опціональний ланцюжок)
    logWriter?.error?.(error.message, {
        message: error.message,
        name: error.name,
        statusCode: error.statusCode,
        code: error.code,
        stack: error.stack,

        // Додаємо requestId для зв'язку логів (якщо є middleware для цього)
        requestId: req.requestId || req.headers['x-request-id'],
        сorrelationId: req.correlationId || req.headers['x-correlation-id'],

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
        user: req.user || { userId: 'anonymous' },

        // Якщо помилка була обгорткою над іншою помилкою (наприклад, від БД)
        meta: error.meta || null,
        errors: error.errors,
        originalError: error.originalError
            ? {
                  message: error.originalError.message,
                  stack: error.originalError.stack,
                  name: error.originalError.name,
              }
            : null,
    })

    // 4. Формування відповіді
    // В продакшені — без stack, originalError, errors (якщо хочеш)
    const isDev = process.env.NODE_ENV === 'development'
    const responsePayload = error.toResponseJSON()

    if (isDev) {
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

    // 5. Відправка відповіді
    res.status(error.statusCode).json(responsePayload)
}

export default globalErrorHandler
