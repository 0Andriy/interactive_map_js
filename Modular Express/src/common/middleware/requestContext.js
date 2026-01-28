/**
 * @file Middleware for managing request and correlation IDs within the application context.
 */

import crypto from 'node:crypto'
import { asyncLocalStorage } from '../utils/context.js'

/**
 * Middleware to manage `X-Request-Id` and `X-Correlation-Id` for incoming requests.
 *
 * This middleware performs the following actions:
 * 1. Checks for `X-Request-Id` and `X-Correlation-Id` in the request headers.
 * 2. If `X-Request-Id` is not present, a new UUID is generated.
 * 3. If `X-Correlation-Id` is not present, it defaults to the `X-Request-Id`.
 * 4. Sets these IDs in the response headers (`X-Request-Id`, `X-Correlation-Id`).
 * 5. Stores these IDs in an `AsyncLocalStorage` instance, making them accessible throughout the request's lifecycle,
 * particularly useful for logging and tracing.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The next middleware function in the stack.
 * @returns {void}
 */
export const requestContextMiddleware = (req, res, next) => {
    // Check for existing X-Request-Id and X-Correlation-Id headers
    const requestId = req.headers['x-request-id'] || crypto.randomUUID()
    const correlationId = req.headers['x-correlation-id'] || requestId

    // Add headers to the response
    res.setHeader('X-Request-Id', requestId)
    res.setHeader('X-Correlation-Id', correlationId)

    // Створюємо об'єкт контексту, який можна буде розширювати
    const context = {
        requestId,
        correlationId,
        user: null, // Буде наповнено пізніше в loggingUserResolver
    }

    // Store in AsyncLocalStorage for later use (e.g., in logging)
    asyncLocalStorage.run(context, () => {
        next()
    })
}
