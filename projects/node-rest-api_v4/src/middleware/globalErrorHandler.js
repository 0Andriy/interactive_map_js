/**
 * @file Global error handling middleware for Express applications.
 */

import logger from '../utils/logger.js' // Assuming '../utils/logger.js' exports a Winston logger instance

export class CustomError extends Error {
    constructor(message, statusCode = 500, code = 'SERVER_ERROR') {
        super(message)
        this.name = this.constructor.name
        this.statusCode = statusCode
        this.code = code
        Error.captureStackTrace(this, this.constructor)
    }
}

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
    // 1. Log error details
    logger.error({
        message: err.message,
        stack: err.stack, // Very important!
        name: err.name,
        // Additional properties if any, e.g., err.statusCode
        statusCode: err.statusCode || 500,
        status: err.status || 'error',
        // If you have your own custom error properties, log them here
        // originalError: err // If you need to see the entire error object directly

        // 2. Log request details
        request: {
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            // headers: req.headers, // Be careful with sensitive data! Can be filtered.
            params: req.params,
            query: req.query,
            // body: req.body, // Be careful with sensitive data! Sanitize or don't log.
        },
        // 3. Log user details (if available)
        user: req.user
            ? {
                  id: req.user.id,
                  email: req.user.email, // If available, again, without sensitive data
              }
            : null,
        // 4. Other contextual data
        // correlationId: req.headers['x-correlation-id'] || generateUniqueId(), // For request tracing
    })

    // Set status code and message for the client response
    err.statusCode = err.statusCode || 500
    err.status = err.status || 'error'

    if (err instanceof CustomError) {
        statusCode = err.statusCode
        message = err.message
        code = err.code
    }

    // Send response to the client (do not send stack trace to client in production!)
    res.status(err.statusCode).json({
        statusCode: err.statusCode,
        status: err.status,
        message:
            err.message || 'Щось пішло не так на сервері. Будь ласка, спробуйте ще раз пізніше.',
        // Do not include 'error: err' in production, as it can reveal internal details.
        // error: process.env.NODE_ENV === 'development' ? err : undefined, // Only for development
    })
}

export default globalErrorHandler
