import http from 'http'
import { createSocketServer } from './modules/socket-engine/index.js'
import { createExpressApp } from './app.js'
import { logger } from './utils/logger.js'

const PORT = process.env.PORT || 3000

// 1. Створюємо базовий HTTP сервер
const httpServer = http.createServer()

// 2. Ініціалізуємо наш кастомний WebSocket рушій
const io = createSocketServer(
    httpServer,
    null,
    {
        path: '/ws',
        gracePeriodMs: 3000,
    },
    logger,
)

// 3. Створюємо Express додаток, передаючи туди io
const app = createExpressApp(io)

// 4. Направляємо всі HTTP запити з сервера в Express
httpServer.on('request', app)

// 5. Запуск єдиної синергії Express + WebSockets на одному порті
httpServer.listen(PORT, () => {
    logger.info(`Сервер успішно стартував на порту ${PORT}`)
    logger.info(`REST API: http://localhost:${PORT}/api/v1`)
    logger.info(`WebSockets: ws://localhost:${PORT}/ws`)
})
