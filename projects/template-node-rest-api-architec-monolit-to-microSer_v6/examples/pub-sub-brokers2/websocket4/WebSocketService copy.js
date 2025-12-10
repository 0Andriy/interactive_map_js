/**
 * @file Основной класс менеджера WebSocket-сервера, отвечающий за инициализацию,
 * управление соединениями и маршрутизацию событий.
 */

// WsServerManager.js
import { WebSocketServer } from 'ws'
import WebSocketConnection from './WebSocketConnection.js'
import WebSocketNamespace from './WebSocketNamespace.js'

class WsServerManager {
    #wss
    /** @type {Map<string, WebSocketConnection>} Глобальна мапа активних з'єднань по ID */
    #connections = new Map()
    /** @type {Map<string, WebSocketNamespace>} Мапа просторів імен (chat, game) */
    #namespaces = new Map()
    #logger
    #pubSubBroker // Для горизонтального масштабування

    /**
     * @param {object} config - Об'єкт конфігурації.
     * @param {number} config.port - Порт сервера.
     * @param {object} config.logger - Об'єкт логера (наприклад, console, winston).
     * @param {object} [config.pubSubBroker] - Брокер повідомлень (наприклад, Redis client).
     * @param {object} config.namespaceHandlers - Об'єкт з функціями обробки для кожного NS.
     */
    constructor(config) {
        this.#logger = config.logger || console
        this.#pubSubBroker = config.pubSubBroker || null

        this.#wss = new WebSocketServer({ port: config.port })
        this.#logger.info(`WebSocket Server starting on port ${config.port}`)

        this.#setupNamespaces(config.namespaceHandlers)
        this.#wss.on('connection', this.#handleConnection)
    }

    /**
     * Ініціалізує простори імен та прив'язує до них зовнішні обробники логіки.
     */
    #setupNamespaces(handlers) {
        for (const nsName in handlers) {
            if (Object.hasOwnProperty.call(handlers, nsName)) {
                const nsHandler = handlers[nsName]
                // Передаємо logger та pubSubBroker до namespace
                const namespace = new WebSocketNamespace(
                    nsName,
                    this.#connections,
                    this.#logger,
                    this.#pubSubBroker,
                )
                this.#namespaces.set(nsName, namespace)

                // Прив'язуємо зовнішній обробник до namespace. onMessage буде викликано ззовні.
                namespace.onMessage = nsHandler.bind(this) // Прив'язуємо this менеджера, якщо потрібно
            }
        }
    }

    // Методи #handleConnection, #handleClose залишаються майже незмінними.

    #handleConnection = (ws) => {
        const connectionId = crypto.randomUUID()
        const connection = new WebSocketConnection(ws, connectionId, this.#logger)
        this.#connections.set(connectionId, connection)
        // ... (on message, close, pong handlers) ...
        ws.on('message', (message) => this.#handleMessage(connectionId, message))
        ws.on('close', () => this.#handleClose(connectionId))
        ws.on('pong', () => connection.markAlive())
    }

    #handleClose = (connectionId) => {
        // ... (логіка закриття з'єднання та видалення з NS/Rooms) ...
        const connection = this.#connections.get(connectionId)
        if (connection) {
            this.#namespaces.forEach((ns) => {
                connection.leaveNamespace(ns.name)
            })
            this.#connections.delete(connectionId)
        }
    }

    /**
     * Маршрутизує вхідні повідомлення до відповідного простору імен.
     */
    #handleMessage = (connectionId, message) => {
        const connection = this.#connections.get(connectionId)
        if (!connection) return

        try {
            // Очікуваний формат: { namespace: 'chat', type: 'ACTION_TYPE', payload: {...} }
            const parsedMessage = JSON.parse(message)
            const { namespace, type, payload } = parsedMessage

            const ns = this.#namespaces.get(namespace)

            if (ns && typeof ns.onMessage === 'function') {
                // Викликаємо зовнішній обробник, передаючи йому NS-контекст, connection та дані
                ns.onMessage(ns, connection, type, payload)
            } else {
                this.#logger.warn(`Handler not found for namespace: ${namespace}`)
                connection.send(JSON.stringify({ error: 'Unknown namespace or missing handler' }))
            }
        } catch (error) {
            this.#logger.error(`Failed to process message from ${connectionId}:`, error)
        }
    }
}

export default WsServerManager
