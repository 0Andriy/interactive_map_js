// index.js
import http from 'http'
import express from 'express' // Імпортуємо Express
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
    const server = new RealtimeServer(logger, {}, serviceFactory)

    try {
        await server.connect()

        const chatNamespace = server.getOrCreateNamespace('chat', { autoDeleteEmpty: true })
        const gameNamespace = server.getOrCreateNamespace('game', { autoDeleteEmpty: false })
        const publicNamespace = server.getOrCreateNamespace('public', { requiresAuth: false })

        chatNamespace.addGlobalScheduledTask(
            'databaseSynchronizer',
            { intervalMs: 20000, runOnActivation: true, runOnlyOnLeader: true },
            async (params) => {
                /* ... */
            },
        )

        // Внутрішня підписка RealtimeServer на глобальні сповіщення
        // Більше немає потреби підписуватися тут, цим займається сам RealtimeServer

        // --- Налаштування Express та REST API ---
        const app = express()
        app.use(express.json()) // Для парсингу JSON у тілі запиту

        // REST API-ендпоінт для відправки сповіщень
        app.post('/api/notify', async (req, res) => {
            const { text, type = 'global_notification' } = req.body
            if (!text) {
                return res.status(400).json({ error: 'Text field is required.' })
            }
            logger.log(`Received API request to broadcast notification: "${text}"`)

            // Викликаємо новий метод RealtimeServer для розсилки
            await server.broadcastNotification({ type, text })

            res.status(200).json({ message: 'Notification sent successfully.' })
        })

        const httpServer = http.createServer(app)
        server.listen(httpServer) // Передаємо HTTP-сервер до RealtimeServer

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
