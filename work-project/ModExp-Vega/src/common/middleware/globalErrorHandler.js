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
    // Це запобігає помилці - Захист від повторної відправки заголовків [ERR_HTTP_HEADERS_SENT]
    if (res.headersSent) {
        return next(err)
    }

    // 2. Нормалізація помилки: переконуємося, що працюємо з екземпляром CustomError
    const isCustom = err instanceof CustomError
    const error = isCustom ? err : CustomError.from(err)

    // Витягуємо дані для зручності
    const statusCode = error.statusCode || 500
    const errorCode = error.code || 'INTERNAL_SERVER_ERROR'
    const errorMessage = error.message || 'Internal Server Error'
    const errors = error.errors || null

    // 3. Формування об'єкта для логування
    // Використовуємо req.logger, якщо він доданий через middleware, інакше стандартний
    const logWriter = req.logger || logger
    const isDev = process.env.NODE_ENV === 'development'

    // Збір Request ID для повного Observability-трасування запиту
    const requestId = req.requestId || req.headers['x-request-id'] || null
    const correlationId = req.correlationId || req.headers['x-correlation-id'] || null

    // 3. Журналювання (використовуємо опціональний ланцюжок)
    logWriter?.error?.(error.message, {
        message: error.message,
        name: error.name,
        statusCode,
        errorCode,
        stack: error.stack,
        requestId,
        correlationId,

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
        errors: errors,
        originalError: error.originalError
            ? {
                  name: error.originalError.name,
                  message: error.originalError.message,
                  stack: error.originalError.stack,
              }
            : null,
    })

    // 4. Підготовка Meta-даних для відповіді клієнту
    // Сюди ми кладемо технічну інформацію, яка не є частиною основної помилки
    const responseMeta = {
        requestId,
        ...(error.meta || {}),
    }

    // Якщо ми в режимі дебагу (Development) — додаємо максимум технічного контексту
    if (isDev) {
        // Додатково даємо стек та оригінальну помилку
        responseMeta.stack = error.stack

        if (error.originalError) {
            responseMeta.originalError = {
                message: error.originalError.message,
                stack: error.originalError.stack,
            }
        }

        // Можна також додати errors для детального дебагу
        if (error.errors && error.errors.length > 0) {
            responseMeta.errors = error.errors
        }
    }

    // 5. Формування відповіді
    // В продакшені — без stack, originalError, errors (якщо хочеш)
    const errorPayload = error.toResponseJSON()

    // 6. Відправка відповіді
    // Використовуємо наш метод .error(), який ми додали в responseHandler
    // Якщо з якихось причин метод не встиг додатися (помилка на старті),
    // робимо пряму відповідь у тому ж форматі
    if (typeof res.error === 'function') {
        return res.error(errorMessage, {
            statusCode,
            errorCode,
            meta: {
                ...responseMeta,
                ...errorPayload.meta, // Мержимо мета-дані з токена
            },
            errors: errors,
        })
    }

    // Надійний резервний варіант відповіді (якщо системні мідлвари на старті не встигли підвантажитись)
    return res.status(statusCode).json({
        status: errorPayload.status, // 'fail' або 'error' згідно з JSend
        statusCode,
        code: errorCode,
        message: errorMessage,
        errors: errors,
        meta: {
            timestamp: new Date().toISOString(),
            ...responseMeta,
        },
    })
}

export default globalErrorHandler
