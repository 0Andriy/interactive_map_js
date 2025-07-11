// index.js
import http from 'http' // Імпортуємо стандартний HTTP-модуль
import { ConsoleLogger } from './src/adapters/ConsoleLogger.js'
import { RealtimeServer } from './src/core/RealtimeServer.js'
import { ServiceFactory } from './src/factories/ServiceFactory.js'

async function main() {
    const logger = new ConsoleLogger()
    const wsPort = 8080

    const factoryConfig = {
        mode: 'distributed',
        redis: { url: 'redis://localhost:6379' },
        leaderKey: 'global_app_leader',
        leaderTtlMs: 15000,
        leaderRenewalIntervalMs: 5000,
    }
    logger.log('Running in DISTRIBUTED mode with HTTP server integration.')

    const serviceFactory = new ServiceFactory(logger, factoryConfig)
    const server = new RealtimeServer(logger, {}, serviceFactory) // Передаємо порожні опції для WsAdapter

    try {
        await server.connect()

        // Створюємо простори імен
        const chatNamespace = server.getOrCreateNamespace('chat', { autoDeleteEmpty: true })
        const gameNamespace = server.getOrCreateNamespace('game', { autoDeleteEmpty: false })
        // Додамо публічний namespace, який не потребує токена
        const publicNamespace = server.getOrCreateNamespace('public', { autoDeleteEmpty: true })

        chatNamespace.addGlobalScheduledTask(
            'databaseSynchronizer',
            { intervalMs: 20000, runOnActivation: true, runOnlyOnLeader: true },
            async (params) => {
                /* ... */
            },
        )

        const pubSub = serviceFactory.getPubSub()
        pubSub.subscribe(`global_data_sync:chat`, (channel, data) => {
            logger.log(
                `[NON-LEADER/LEADER] Received global data update from leader on channel '${channel}':`,
                data,
            )
        })

        // Створюємо HTTP-сервер
        const httpServer = http.createServer((req, res) => {
            // Тут може бути ваш REST API
            if (req.url === '/') {
                res.writeHead(200, { 'Content-Type': 'text/plain' })
                res.end('Realtime Server is running.')
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain' })
                res.end('Not Found')
            }
        })

        // Передаємо HTTP-сервер до Realtime-сервера
        server.listen(httpServer)

        httpServer.listen(wsPort, () => {
            logger.log(`HTTP/WebSocket Server is running on port ${wsPort}.`)
            logger.log(`Connect to /ws/chat?token=valid_token_123 for chat.`)
            logger.log(`Connect to /ws/public for guest access.`)
        })
    } catch (error) {
        logger.error('Failed to start RealtimeServer:', error)
        await server
            .shutdown()
            .catch((e) => logger.error('Error during shutdown after startup failure:', e))
        process.exit(1)
    }
}

main().catch(console.error)
