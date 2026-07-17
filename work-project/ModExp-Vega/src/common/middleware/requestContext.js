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
    // 1. Отримуємо або генеруємо унікальні ідентифікатори
    const requestId = req.headers['x-request-id'] || crypto.randomUUID()
    const correlationId = req.headers['x-correlation-id'] || requestId

    // 2. Додаємо ідентифікатори в заголовки запиту для подальшого використання
    req.headers['x-request-id'] = requestId
    req.headers['x-correlation-id'] = correlationId

    // 3. Встановлюємо ідентифікатори в заголовки відповіді для клієнта
    res.setHeader('x-request-id', requestId)
    res.setHeader('x-correlation-id', correlationId)

    // Визначаємо IP (враховуємо проксі-сервери)
    // Якщо Express налаштовано з app.set('trust proxy', true), можна просто req.ip
    const clientIp =
        req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || req.ip

    // Збираємо дані про пристрій
    const userAgent = req.headers['user-agent'] || 'unknown'

    // 4. Створюємо об'єкт контексту, який можна буде розширювати
    const context = {
        requestId,
        correlationId,
        user: null, // Буде наповнено пізніше в loggingUserResolver
        security: {
            ip: clientIp,
            userAgent: userAgent,
            method: req.method,
            url: req.originalUrl,
            referrer: req.headers['referer'] || req.headers['referrer'] || 'direct',
        },
        startTime: Date.now(),
    }

    // 5. Додаємо контекст до об'єкта запиту для легкого доступу в інших middleware/контролерах
    req.requestId = requestId
    req.correlationId = correlationId
    req.context = context

    // 6. Запускаємо AsyncLocalStorage з контекстом для доступу в будь-якій точці обробки запиту
    asyncLocalStorage.run(context, () => {
        next()
    })
}
