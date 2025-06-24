/**
 * @file Middleware for managing request and correlation IDs within the application context.
 */

import { v4 as uuidv4 } from 'uuid'
import { asyncLocalStorage } from '../utils/logger.js' // Assuming logger.js exports an AsyncLocalStorage instance

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
    const requestId = req.headers['x-request-id'] || uuidv4()
    const correlationId = req.headers['x-correlation-id'] || requestId

    // Add headers to the response
    res.setHeader('X-Request-Id', requestId)
    res.setHeader('X-Correlation-Id', correlationId)

    // Store in AsyncLocalStorage for later use (e.g., in logging)
    asyncLocalStorage.run({ requestId, correlationId }, () => {
        next()
    })
}
