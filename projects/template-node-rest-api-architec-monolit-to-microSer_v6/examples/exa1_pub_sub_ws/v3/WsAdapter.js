import { WebSocketServer, WebSocket } from 'ws' // Для роботи з WebSocket
import { v4 as uuidv4 } from 'uuid' // Для унікальних ID з'єднань

/**
 * @class WsAdapter
 * @description Адаптер для інтеграції з WebSocket.
 * Мапить URL-шляхи до просторів імен.
 */
class WsAdapter {
    #wss
    #namespaceHandlers = new Map() // Map<namespaceId, function(socket, message, type)>
    #logger
    // Map<WebSocket, namespaceId> - для відстеження приналежності сокета до простору імен
    #socketToNamespaceMap = new Map()
    // Map<WebSocket, userId> - для відстеження ID користувача для кожного сокета
    #socketToUserIdMap = new Map()

    /**
     * @param {object} options - Опції для WebSocketServer (наприклад, port).
     * @param {object} logger - Екземпляр логера.
     */
    constructor(options, logger) {
        this.#wss = new WebSocketServer(options)
        this.#logger = logger
        this.#setupConnectionHandler()
        this.#logger.log(`WebSocket server started on port ${options.port || 'default'}.`)
    }

    #setupConnectionHandler() {
        this.#wss.on('connection', (ws, req) => {
            const urlPath = req.url
            const namespaceId = this.#extractNamespaceId(urlPath)
            const userId = uuidv4() // Приклад: генеруємо унікальний ID для кожного з'єднання

            this.#logger.log(
                `New WebSocket connection from '${req.socket.remoteAddress}' to URL: '${urlPath}' (Namespace: '${namespaceId}')`,
            )

            const handler = this.#namespaceHandlers.get(namespaceId)

            if (!handler) {
                this.#logger.warn(
                    `No handler found for namespace '${namespaceId}'. Closing connection.`,
                )
                ws.close(1000, `No handler for namespace ${namespaceId}`)
                return
            }

            // Зберігаємо асоціацію WebSocket з простором імен та користувачем
            this.#socketToNamespaceMap.set(ws, namespaceId)
            this.#socketToUserIdMap.set(ws, userId)

            // Виклик обробника onConnect для конкретного простору імен
            handler.onConnect(ws, userId)

            ws.on('message', (message) => {
                try {
                    // Парсимо JSON, якщо це не бінарні дані
                    const parsedMessage = JSON.parse(message.toString())
                    handler.onMessage(ws, userId, parsedMessage)
                } catch (e) {
                    this.#logger.error(
                        `Failed to parse WebSocket message from ${userId} in ${namespaceId}:`,
                        e,
                    )
                    handler.onMessage(ws, userId, message.toString()) // Передати як рядок, якщо не JSON
                }
            })

            ws.on('close', (code, reason) => {
                this.#logger.log(
                    `WebSocket connection closed for user '${userId}' from namespace '${namespaceId}'. Code: ${code}, Reason: ${reason}`,
                )
                handler.onDisconnect(ws, userId)
                this.#socketToNamespaceMap.delete(ws)
                this.#socketToUserIdMap.delete(ws)
            })

            ws.on('error', (error) => {
                this.#logger.error(
                    `WebSocket error for user '${userId}' from namespace '${namespaceId}':`,
                    error,
                )
                // Обробник помилок, можна додатково сповістити onDisconnect
                handler.onError(ws, userId, error)
            })
        })

        this.#wss.on('error', (error) => {
            this.#logger.error('WebSocket server error:', error)
        })
    }

    /**
     * Реєструє обробник для конкретного простору імен.
     * @param {string} namespaceId - Ідентифікатор простору імен (наприклад, 'chat', 'game').
     * @param {object} handlers - Об'єкт з функціями-обробниками.
     * @param {function(ws: WebSocket, userId: string)} handlers.onConnect - Викликається при підключенні.
     * @param {function(ws: WebSocket, userId: string, message: any)} handlers.onMessage - Викликається при отриманні повідомлення.
     * @param {function(ws: WebSocket, userId: string)} handlers.onDisconnect - Викликається при відключенні.
     * @param {function(ws: WebSocket, userId: string, error: Error)} [handlers.onError] - Викликається при помилці.
     */
    registerNamespaceHandler(namespaceId, handlers) {
        if (this.#namespaceHandlers.has(namespaceId)) {
            this.#logger.warn(
                `Namespace handler for '${namespaceId}' already registered. Overwriting.`,
            )
        }
        this.#namespaceHandlers.set(namespaceId, {
            onConnect: handlers.onConnect || (() => {}),
            onMessage: handlers.onMessage || (() => {}),
            onDisconnect: handlers.onDisconnect || (() => {}),
            onError:
                handlers.onError ||
                ((ws, userId, err) =>
                    this.#logger.error(`WS Error in ${namespaceId} for ${userId}:`, err)),
        })
        this.#logger.log(`Registered handler for namespace '${namespaceId}'.`)
    }

    /**
     * Екстрагує ідентифікатор простору імен з URL.
     * Приклад: /chat -> chat, /game/room123 -> game
     * @param {string} urlPath - Шлях URL.
     * @returns {string} Ідентифікатор простору імен.
     */
    #extractNamespaceId(urlPath) {
        if (!urlPath || urlPath === '/') {
            return 'default' // або будь-який інший дефолтний простір імен
        }
        const parts = urlPath.split('/').filter(Boolean) // Розбиває і видаляє пусті рядки
        return parts[0] || 'default' // Перша частина шляху буде простором імен
    }

    /**
     * Відправляє повідомлення конкретному користувачу.
     * @param {string} userId - ID користувача.
     * @param {any} message - Повідомлення для відправки (буде серіалізовано в JSON).
     * @returns {boolean} True, якщо повідомлення було відправлено.
     */
    sendMessageToUser(userId, message) {
        // Знайти WebSocket-з'єднання за userId
        let targetWs = null
        for (const [ws, id] of this.#socketToUserIdMap.entries()) {
            if (id === userId) {
                targetWs = ws
                break
            }
        }

        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify(message))
            return true
        }
        this.#logger.warn(
            `Failed to send message to user '${userId}': Connection not found or not open.`,
        )
        return false
    }

    /**
     * Відправляє повідомлення всім користувачам у заданому списку.
     * @param {Array<string>} userIds - Масив ID користувачів.
     * @param {any} message - Повідомлення для відправки (буде серіалізовано в JSON).
     */
    broadcastToUsers(userIds, message) {
        const msg = JSON.stringify(message)
        userIds.forEach((userId) => {
            let targetWs = null
            for (const [ws, id] of this.#socketToUserIdMap.entries()) {
                if (id === userId) {
                    targetWs = ws
                    break
                }
            }

            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(msg)
            } else {
                this.#logger.debug(
                    `Skipping broadcast to user '${userId}': Connection not found or not open.`,
                )
            }
        })
    }

    /**
     * Закриває WebSocket сервер.
     */
    async close() {
        return new Promise((resolve, reject) => {
            this.#wss.close((err) => {
                if (err) {
                    this.#logger.error('Error closing WebSocket server:', err)
                    return reject(err)
                }
                this.#logger.log('WebSocket server closed.')
                resolve()
            })
        })
    }
}

export { WsAdapter }
