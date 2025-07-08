// src/server/MyWebSocketServer.js
import { WebSocketServer } from 'ws'
import { createClient } from 'redis' // Для обробки команд від Redis, якщо це масштабований сценарій
import ClientManager from './ClientManager.js'
import EventManager from './EventManager.js'
import MessageRouter from './MessageRouter.js'
import 'dotenv/config'

class MyWebSocketServer {
    constructor(options) {
        this.wss = new WebSocketServer(options)
        this.clientManager = new ClientManager()
        this.eventManager = new EventManager()
        this.messageRouter = new MessageRouter(this.clientManager, this.eventManager)

        this._setupEventHandlers()
        this._setupRedisSubscriberForClusterCommands()
    }

    _setupEventHandlers() {
        this.wss.on('connection', (ws, req) => this._onConnection(ws, req))
        this.wss.on('listening', () =>
            console.log(`WebSocket server listening on port ${process.env.WS_PORT}`),
        )
        this.wss.on('error', (error) => console.error('WebSocket server error:', error))
    }

    /**
     * Налаштовує Redis-слухача для команд від інших вузлів (REST API або інших WS-серверів).
     * Це дозволяє цьому екземпляру WS-сервера реагувати на зовнішні команди.
     */
    _setupRedisSubscriberForClusterCommands() {
        // Використовуємо інший клієнт Redis, щоб не конфліктувати з EventManager
        // (EventManager має свій publisher та subscriber для трансляції повідомлень).
        // Цей subscriber конкретно для команд керування сервером/клієнтами.
        const commandSubscriber = createClient({ url: process.env.REDIS_URL })
        commandSubscriber.on('error', (err) =>
            console.error('Redis Command Subscriber Error:', err),
        )

        commandSubscriber
            .connect()
            .then(() => {
                console.log('Redis command subscriber connected.')
                // Підписуємося на той самий канал, що й EventManager, щоб ловити команди керування
                commandSubscriber.subscribe('ws_cluster_commands', (message) => {
                    try {
                        const command = JSON.parse(message)
                        console.log(`[WS Server] Received cluster command from Redis:`, command)

                        // Обробка команд, що стосуються відключення клієнтів
                        if (command.type === 'disconnectUser') {
                            const { userId } = command.payload
                            const clientToDisconnect = this.clientManager.getClient(userId)

                            if (
                                clientToDisconnect &&
                                clientToDisconnect.ws.readyState === clientToDisconnect.ws.OPEN
                            ) {
                                console.log(
                                    `[WS Server] Disconnecting user ${userId} via Redis command.`,
                                )
                                clientToDisconnect.ws.close(1000, 'Disconnected by administrator') // 1000 - Normal Closure
                            } else {
                                console.log(
                                    `[WS Server] User ${userId} not found or not open on this WS server.`,
                                )
                            }
                        }
                        // Інші команди керування, якщо потрібно (наприклад, 'broadcastAdminMessage')
                    } catch (e) {
                        console.error('[WS Server] Error parsing or handling Redis command:', e)
                    }
                })
            })
            .catch((err) => {
                console.error('Failed to connect Redis command subscriber:', err)
                process.exit(1)
            })
    }

    _onConnection(ws, req) {
        const client = this.clientManager.addClient(ws)
        console.log(`Client connected: ${client.id}`)

        // Приклад: відправка початкового повідомлення або запит на аутентифікацію
        client.send({
            type: 'welcome',
            payload: { clientId: client.id, message: 'Please authenticate.' },
        })

        ws.on('message', (message) => this._onMessage(client, message))
        ws.on('close', () => this._onClose(client))
        ws.on('error', (error) => this._onError(client, error))
    }

    _onMessage(client, message) {
        try {
            const parsedMessage = JSON.parse(message.toString())
            this.messageRouter.route(client, parsedMessage)
        } catch (e) {
            console.error(`Invalid message from ${client.id}:`, e.message)
            client.send({ type: 'error', payload: 'Invalid JSON message' })
        }
    }

    _onClose(client) {
        console.log(`Client disconnected: ${client.id}`)
        this.clientManager.removeClient(client.id) // Це також оновлює лічильники кімнат
    }

    _onError(client, error) {
        console.error(`Client ${client.id} error:`, error)
    }

    start() {
        // Сервер стартує автоматично при ініціалізації
    }

    stop() {
        this.wss.close()
        console.log('WebSocket server stopped.')
    }
}

export default MyWebSocketServer
