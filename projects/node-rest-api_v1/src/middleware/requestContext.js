import { v4 as uuidv4 } from 'uuid'
import { asyncLocalStorage } from '../utils/logger.js'

// Middleware для управління requestId і додавання його у відповідь
export const requestContextMiddleware = (req, res, next) => {
    // Перевірка наявності X-Request-Id та X-Correlation-Id
    const requestId = req.headers['x-request-id'] || uuidv4()
    const correlationId = req.headers['x-correlation-id'] || requestId

    // Додаємо заголовки у відповідь
    res.setHeader('X-Request-Id', requestId)
    res.setHeader('X-Correlation-Id', correlationId)

    // Зберігаємо в AsyncLocalStorage для подальшого використання
    asyncLocalStorage.run({ requestId, correlationId }, () => {
        next()
    })
}
