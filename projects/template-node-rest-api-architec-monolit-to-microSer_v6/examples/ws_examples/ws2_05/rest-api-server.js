// rest-api-server.js
import express from 'express'
import { createClient } from 'redis'
import 'dotenv/config' // Завантажуємо змінні оточення

const app = express()
app.use(express.json()) // Для парсингу JSON тіла запитів

// Ініціалізуємо Redis-клієнт для публікації повідомлень
const publisher = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
})

publisher.on('error', (err) => console.error('Redis Publisher Error:', err))
publisher
    .connect()
    .then(() => {
        console.log('REST API: Redis publisher connected')
    })
    .catch((err) => {
        console.error('REST API: Failed to connect Redis publisher:', err)
        process.exit(1)
    })

// --- REST API Ендпоінт для відключення користувача WS ---
app.post('/api/disconnect-ws-user', async (req, res) => {
    const { userId } = req.body

    if (!userId) {
        return res.status(400).json({ message: 'User ID is required' })
    }

    try {
        const channel = 'ws_cluster_commands' // Той самий канал, що і в WS-сервері
        const command = {
            type: 'disconnectUser',
            payload: { userId: userId },
        }

        await publisher.publish(channel, JSON.stringify(command))
        console.log(`REST API: Command to disconnect user ${userId} published to Redis.`)

        res.status(200).json({
            message: `Attempting to disconnect WebSocket user ${userId}. Note: User might be connected to another WS server.`,
        })
    } catch (error) {
        console.error('REST API: Error publishing disconnect command to Redis:', error)
        res.status(500).json({ message: 'Failed to send disconnect command.' })
    }
})

// --- REST API Ендпоінт для широкомовної розсилки повідомлень ---
app.post('/api/broadcast-message', async (req, res) => {
    const { message } = req.body

    if (!message) {
        return res.status(400).json({ message: 'Message is required' })
    }

    try {
        const channel = 'ws_cluster_commands'
        const command = {
            type: 'publishGlobally',
            payload: {
                payload: { type: 'adminBroadcast', message: message },
                excludeClientId: null,
            },
        }

        await publisher.publish(channel, JSON.stringify(command))
        console.log(`REST API: Global broadcast message published to Redis.`)

        res.status(200).json({ message: `Global broadcast message sent.` })
    } catch (error) {
        console.error('REST API: Error publishing broadcast message to Redis:', error)
        res.status(500).json({ message: 'Failed to send broadcast message.' })
    }
})

const REST_PORT = parseInt(process.env.REST_PORT || '3000', 10)
app.listen(REST_PORT, () => {
    console.log(`REST API Server running on port ${REST_PORT}`)
})
