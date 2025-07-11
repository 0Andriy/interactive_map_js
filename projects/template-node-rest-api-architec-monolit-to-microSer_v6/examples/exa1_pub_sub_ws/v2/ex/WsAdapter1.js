// src/adapters/WsAdapter.js
import { WebSocketServer } from 'ws'
import { ILogger } from '../interfaces/ILogger.js'

class WsAdapter {
    #wss
    #logger
    #namespaceHandlers = new Map()
    #userIds = new Map() // Додаткова мапа для зберігання userId з WebSocket

    constructor(options, logger) {
        if (!(logger instanceof ILogger)) {
            throw new Error('Logger must be an instance of ILogger.')
        }
        this.#logger = logger
        this.#wss = new WebSocketServer(options)
        this.#logger.log('WebSocket adapter initialized.')
    }

    /**
     * Обробляє подію upgrade від HTTP-сервера.
     * @param {http.IncomingMessage} request
     * @param {net.Socket} socket
     * @param {Buffer} head
     * @param {string} namespaceId - ID простору імен з URL.
     * @param {string} userId - ID користувача, отриманий під час автентифікації.
     */
    handleUpgrade(request, socket, head, namespaceId, userId) {
        this.#wss.handleUpgrade(request, socket, head, (ws) => {
            this.#wss.emit('connection', ws, request, namespaceId, userId)
        })
    }

    registerNamespaceHandler(namespaceId, handlers) {
        // Зберігаємо ID користувача при з'єднанні.
        this.#wss.on('connection', (ws, request, connNamespaceId, userId) => {
            if (connNamespaceId === namespaceId) {
                this.#userIds.set(ws, userId)
                handlers.onConnect(ws, userId)

                ws.on('message', (message) => {
                    const parsedMessage = JSON.parse(message)
                    // Перевіряємо, чи повідомлення відповідає цьому namespace
                    if (parsedMessage.namespaceId === namespaceId) {
                        handlers.onMessage(ws, this.#userIds.get(ws), parsedMessage)
                    }
                })

                ws.on('close', () => {
                    handlers.onDisconnect(ws, this.#userIds.get(ws))
                    this.#userIds.delete(ws)
                })

                ws.on('error', (error) => {
                    handlers.onError(ws, this.#userIds.get(ws), error)
                })
            }
        })
    }

    // ... (методи sendMessageToUser, sendMessageToRoom, broadcast та close без змін)
}

export { WsAdapter }
