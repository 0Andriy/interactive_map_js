import http from 'http'
import crypto from 'crypto'
import { SocketServer } from './core/SocketServer.js'
import { StateFactory } from './factories/StateFactory.js'
import { BrokerFactory } from './factories/BrokerFactory.js'
import { ChatNamespace } from './namespaces/ChatNamespace.js'
import { HybridNamespace } from './namespaces/HybridNamespace.js'

const httpServer = http.createServer()
const serverId = `srv:${crypto.randomBytes(4).toString('hex')}`

// Ініціалізація залежностей (Dependency Injection)
const state = StateFactory.create('memory') // або 'redis'
const broker = BrokerFactory.create('memory')
const logger = {
    info: (m) => console.log(`[\x1b[32mINFO\x1b[0m] ${m}`),
    error: (m, e) => console.error(`[\x1b[31mERROR\x1b[0m] ${m}`, e || ''),
    debug: (m) => console.debug(`[\x1b[34mDEBUG\x1b[0m] ${m}`),
}

const socketApp = new SocketServer({ server: httpServer, basePath: '/ws', state, broker, logger })

// Створення та реєстрація неймспейсів
socketApp.registerNamespace(new ChatNamespace({ name: '/chat', serverId, state, broker, logger }))
socketApp.registerNamespace(
    new HybridNamespace({ name: '/admin', serverId, state, broker, logger }),
)

socketApp.init()

// Приклад 1: Відправити всім у неймспейс чату (на всі сервери)
// chat.broadcast('announcement', 'Чат буде перезавантажено через 5 хвилин');

// Приклад 2: Відправити ВЗАГАЛІ ВСІМ (на всі неймспейси та сервери)
// socketApp.broadcastAll('maintenance', 'Технічні роботи на всьому порталі');

// Приклад 3: Перегляд метрик підключення
setInterval(() => {
    const connections = socketApp.namespaces.get('/chat').connections
    connections.forEach((c) => {
        console.log(
            `Socket ${c.id} | IP: ${c.meta.ip} | Uptime: ${new Date() - c.meta.connectedAt}ms`,
        )
    })
}, 60000)

// Очищення при завершенні
const shutdown = async () => {
    logger.info('Graceful shutdown initiated...')

    for (const ns of socketApp.namespaces.values()) {
        await ns.destroy() // Тут викликається unsubscribe від брокера
    }

    await state.clearServerData()
    httpServer.close(() => {
        logger.info('HTTP and WS server closed.')
        process.exit(0)
    })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

httpServer.listen(3000, () => {
    logger.info('WebSocket Server 2025 is running on port 3000')
})
