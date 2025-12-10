import { WebSocketServer } from 'ws' // Припустимо, ви використовуєте бібліотеку 'ws'
import WebSocketConnection from './WebSocketConnection.js'
import WebSocketNamespace from './WebSocketNamespace.js'
// WebSocketRoom імпортується через WebSocketNamespace, тому тут не потрібен

/**
 * Головний менеджер WebSocket-сервера, відповідальний за ініціалізацію,
 * керування з'єднаннями та маршрутизацію подій до відповідних обробників просторів імен.
 */
class WsServerManager {
    #wss
    /** @type {Map<string, WebSocketConnection>} Глобальна мапа активних з'єднань по ID */
    #connections = new Map()
    /** @type {Map<string, WebSocketNamespace>} Мапа просторів імен (chat, game) */
    #namespaces = new Map()
    #logger

    constructor(port, logger = console) {
        this.#logger = logger
        this.#wss = new WebSocketServer({ port })
        this.#logger.info(`WebSocket Server starting on port ${port}`)

        this.#setupNamespaces()
        this.#wss.on('connection', this.#handleConnection)
    }

    /**
     * Ініціалізує простори імен та прив'язує до них обробники логіки.
     */
    #setupNamespaces() {
        // Ініціалізуємо простір імен 'chat'
        const chatNamespace = new WebSocketNamespace('chat', this.#connections, this.#logger)
        this.#namespaces.set('chat', chatNamespace)
        // Прив'язуємо спеціальну логіку обробки для чату
        chatNamespace.onMessage = this.#handleChatLogic

        // Ініціалізуємо простір імен 'game'
        const gameNamespace = new WebSocketNamespace('game', this.#connections, this.#logger)
        this.#namespaces.set('game', gameNamespace)
        // Прив'язуємо спеціальну логіку обробки для ігор
        gameNamespace.onMessage = this.#handleGameLogic

        // Тут ви можете додати інші простори імен (admin, notifications тощо)
    }

    /**
     * Обробляє нове WebSocket-з'єднання.
     */
    #handleConnection = (ws) => {
        const connectionId = crypto.randomUUID() // Використовуємо UUID для ID
        const connection = new WebSocketConnection(ws, connectionId, this.#logger)
        this.#connections.set(connectionId, connection)

        this.#logger.info(`New connection established: ${connectionId}`)

        ws.on('message', (message) => this.#handleMessage(connectionId, message))
        ws.on('close', () => this.#handleClose(connectionId))
        ws.on('pong', () => connection.markAlive())

        // Додайте логіку heartbeat тут або в окремому менеджері
    }

    /**
     * Маршрутизує вхідні повідомлення до відповідного простору імен.
     */
    #handleMessage = (connectionId, message) => {
        const connection = this.#connections.get(connectionId)
        if (!connection) return

        try {
            // Клієнт повинен надсилати JSON у форматі: { namespace: 'chat', type: 'join', payload: {...} }
            const parsedMessage = JSON.parse(message)
            const { namespace, type, payload } = parsedMessage

            const ns = this.#namespaces.get(namespace)

            if (ns && typeof ns.onMessage === 'function') {
                // Викликаємо спеціалізований обробник логіки для цього простору імен
                ns.onMessage(connection, type, payload)
            } else {
                this.#logger.warn(`Handler not found for namespace: ${namespace}`)
                connection.send(JSON.stringify({ error: 'Unknown namespace or type' }))
            }
        } catch (error) {
            this.#logger.error(`Failed to process message from ${connectionId}:`, error)
            connection.send(JSON.stringify({ error: 'Invalid message format (must be JSON)' }))
        }
    }

    /**
     * Спеціальна логіка обробки для простору імен 'chat'.
     */
    #handleChatLogic = (connection, type, payload) => {
        const chatNS = this.#namespaces.get('chat')

        switch (type) {
            case 'JOIN_ROOM':
                // Клієнт хоче приєднатися до кімнати 'general'
                chatNS.joinRoom(payload.roomName || 'general', connection.id)
                connection.send(JSON.stringify({ success: `Joined room ${payload.roomName}` }))
                chatNS.broadcastToRoom(
                    payload.roomName,
                    JSON.stringify({
                        type: 'USER_JOINED',
                        userId: connection.getUserId() || connection.id,
                    }),
                )
                break

            case 'SEND_MESSAGE':
                // Клієнт надсилає повідомлення в кімнату
                const messageData = JSON.stringify({
                    type: 'NEW_MESSAGE',
                    user: connection.getUserId(),
                    text: payload.text,
                })
                chatNS.broadcastToRoom(payload.roomName, messageData, connection.id) // Виключаємо відправника
                break

            case 'AUTHENTICATE':
                connection.authenticate(payload.userId)
                connection.send(JSON.stringify({ success: 'Authenticated' }))
                break

            // Додайте інші події чату тут
        }
    }

    /**
     * Спеціальна логіка обробки для простору імен 'game'.
     */
    #handleGameLogic = (connection, type, payload) => {
        const gameNS = this.#namespaces.get('game')

        switch (type) {
            case 'MOVE':
                // Логіка перевірки ходу гравця...
                // gameNS.broadcastToRoom(...)
                break
            case 'START_GAME':
                // Логіка початку гри...
                break
        }
    }

    /**
     * Обробляє закриття з'єднання.
     */
    #handleClose = (connectionId) => {
        this.#logger.info(`Connection closed: ${connectionId}`)
        const connection = this.#connections.get(connectionId)

        if (connection) {
            // Автоматично виходимо з усіх кімнат/просторів імен при відключенні
            this.#namespaces.forEach((ns) => {
                connection.leaveNamespace(ns.name)
                // Тут можна додати логіку сповіщення кімнат про вихід гравця
            })
            this.#connections.delete(connectionId)
        }
    }
}

// Приклад використання:
// new WsServerManager(8080);

export default WsServerManager
