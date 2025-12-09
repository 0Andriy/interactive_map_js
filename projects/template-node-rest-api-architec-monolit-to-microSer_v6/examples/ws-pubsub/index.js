// src/index.js

import http from 'http'
import { WebSocketServer } from 'ws'

import { SocketManager } from './core/SocketManager.js'
import { RedisPubSubAdapter } from './di/RedisPubSubAdapter.js'
import { Logger } from './di/Logger.js'
import { setupWebSocketAuth } from './SocketAuthHandler.js'

const PORT = 3000
// Встановлюємо унікальний ID інстансу для Pub/Sub
process.env.NODE_ID = `server-${Math.random().toString(36).substring(2, 8)}`

async function bootstrap() {
    // --- 1. Створення Залежностей (DI) ---
    const logger = new Logger(process.env.NODE_ID)

    // Встановіть вашу конфігурацію Redis
    const redisConfig = {
        host: '127.0.0.1',
        port: 6379,
    }

    const pubSubAdapter = new RedisPubSubAdapter(redisConfig)
    const socketManager = new SocketManager(pubSubAdapter, logger)
    // ----------------------------------------

    // 2. Створення HTTP-сервера
    const httpServer = http.createServer((req, res) => {
        res.writeHead(200)
        res.end(`WebSocket Server Instance ${process.env.NODE_ID} Running`)
    })

    // 3. Створення WebSocket-сервера
    const wss = new WebSocketServer({ server: httpServer })

    // 4. Налаштування обробки підключень (відділений файл)
    setupWebSocketAuth(wss, socketManager, logger)

    httpServer.listen(PORT, () => {
        logger.log(`Server instance ${process.env.NODE_ID} listening on http://localhost:${PORT}`)
    })

    // 5. Обробка вимкнення сервера
    process.on('SIGINT', async () => {
        logger.log('SIGINT received. Shutting down gracefully...')
        try {
            // Закриваємо WebSocket Server
            wss.close()
            // Закриваємо Redis з'єднання
            await pubSubAdapter.quit()

            httpServer.close(() => {
                logger.log('HTTP and WebSocket servers closed. Exiting.')
                process.exit(0)
            })
        } catch (e) {
            logger.error('Error during shutdown', e)
            process.exit(1)
        }
    })
}

bootstrap()
