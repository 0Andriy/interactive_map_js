import http from 'http'
import crypto from 'crypto'
import { SocketServer } from './core/SocketServer.js'
import { StateFactory } from './factories/StateFactory.js'
import { BrokerFactory } from './factories/BrokerFactory.js'
import { SchedulerFactory } from './factories/SchedulerFactory.js'
import { ChatNamespace } from './namespaces/ChatNamespace.js'

const httpServer = http.createServer()
const serverId = `srv:${crypto.randomBytes(4).toString('hex')}`

const logger = {
    _time: () => {
        const now = new Date()
        const date = now.toISOString().split('T')[0]
        const h = String(now.getHours()).padStart(2, '0')
        const m = String(now.getMinutes()).padStart(2, '0')
        const s = String(now.getSeconds()).padStart(2, '0')
        const ms = String(now.getMilliseconds()).padStart(3, '0')

        return `\x1b[90m[${date} ${h}:${m}:${s}.${ms}]\x1b[0m`
    },

    info: (m) => console.log(`${logger._time()} [\x1b[32mINFO\x1b[0m] ${m}`),

    warn: (m) => console.warn(`${logger._time()} [\x1b[33mWARN\x1b[0m] ${m}`),

    error: (m, e = '') => console.error(`${logger._time()} [\x1b[31mERROR\x1b[0m] ${m}`, e),

    debug: (m) => console.debug(`${logger._time()} [\x1b[34mDEBUG\x1b[0m] ${m}`),

    trace: (m) => console.debug(`${logger._time()} [\x1b[35mTRACE\x1b[0m] ${m}`),
}

// Ініціалізація залежностей (Dependency Injection)
const state = StateFactory.create('memory') // або 'redis'
const broker = BrokerFactory.create('memory')
const scheduler = SchedulerFactory.create('memory', { logger: logger })

const socketApp = new SocketServer({
    server: httpServer,
    basePath: '/ws',
    state,
    broker,
    logger,
})

// Створення та реєстрація неймспейсів
socketApp.registerNamespace(
    new ChatNamespace({ name: '/chat', serverId, state, broker, scheduler, logger }),
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
