import { WebSocketServer, WebSocket } from 'ws'
import { v4 as uuidv4 } from 'uuid'

/**
 * @class WsAdapter
 * @description Адаптер для інтеграції з WebSocket.
 * Мапить URL-шляхи до просторів імен та керує з'єднаннями користувачів,
 * використовуючи унікальні строкові ідентифікатори для кожного WebSocket з'єднання.
 */
class WsAdapter {
    #wss
    // Map<namespaceId, function(namespaceId, ws: WebSocket, userId: string, message: any)>
    #namespaceHandlers = new Map()
    #logger

    // Map<string, string> - відстежує приналежність ID сокета до простору імен
    #socketIdToNamespaceMap = new Map()
    // Map<string, string> - відстежує ID користувача для кожного ID сокета
    #socketIdToUserIdMap = new Map()
    // Map<string, Set<string>> - відстежує всі активні ID сокетів для кожного userId
    #userIdToSocketIdsMap = new Map()
    // Map<string, Set<string>> - відстежує, до яких кімнат належить кожен конкретний ID сокета
    #socketIdToRoomIdsMap = new Map()
    // Map<string, WebSocket> - Зворотний мапінг від socketId до самого об'єкта WebSocket (потрібен для відправки повідомлень)
    #socketIdToWsMap = new Map()

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

    /**
     * Внутрішній метод для налаштування обробника нового з'єднання.
     * @private
     */
    #setupConnectionHandler() {
        this.#wss.on('connection', (ws, req) => {
            const socketId = uuidv4() // Унікальний ID для цього конкретного WebSocket з'єднання
            ws.id = socketId // Присвоюємо ID безпосередньо об'єкту ws

            const urlPath = req.url
            const namespaceId = this.#extractNamespaceId(urlPath)
            const userId = ws.userId || this.#extractUserIdFromUrl(req) || uuidv4() // userId має бути отримано через автентифікацію

            this.#logger.log(
                `New WebSocket connection (ID: ${socketId}) from '${req.socket.remoteAddress}' to URL: '${urlPath}' (Namespace: '${namespaceId}', User: '${userId}')`,
            )

            const handler = this.#namespaceHandlers.get(namespaceId)

            if (!handler) {
                this.#logger.warn(
                    `No handler found for namespace '${namespaceId}'. Closing connection (ID: ${socketId}).`,
                )
                ws.close(1000, `No handler for namespace ${namespaceId}`)
                return
            }

            // Зберігаємо асоціації, використовуючи socketId як ключ
            this.#socketIdToNamespaceMap.set(socketId, namespaceId)
            this.#socketIdToUserIdMap.set(socketId, userId)
            this.#socketIdToWsMap.set(socketId, ws) // Зберігаємо посилання на сам об'єкт WebSocket

            if (!this.#userIdToSocketIdsMap.has(userId)) {
                this.#userIdToSocketIdsMap.set(userId, new Set())
            }
            this.#userIdToSocketIdsMap.get(userId).add(socketId)

            this.#socketIdToRoomIdsMap.set(socketId, new Set()) // Ініціалізуємо порожній Set для кімнат цього сокета

            // Виклик обробника onConnect для конкретного простору імен
            handler.onConnect(namespaceId, ws, userId)

            ws.on('message', (message) => {
                try {
                    const parsedMessage = JSON.parse(message.toString())
                    handler.onMessage(namespaceId, ws, userId, parsedMessage)
                } catch (e) {
                    this.#logger.error(
                        `Failed to parse WebSocket message from user ${userId} (Socket ID: ${socketId}) in ${namespaceId}:`,
                        e,
                    )
                    handler.onMessage(namespaceId, ws, userId, message.toString())
                }
            })

            ws.on('close', (code, reason) => {
                this.#logger.log(
                    `WebSocket connection (ID: ${socketId}) closed for user '${userId}' from namespace '${namespaceId}'. Code: ${code}, Reason: ${reason}`,
                )

                // Виклик обробника onDisconnect для конкретного простору імен
                handler.onDisconnect(namespaceId, ws, userId)

                // Очищення внутрішніх мап WsAdapter
                this.#cleanUpSocket(socketId, userId)
            })

            ws.on('error', (error) => {
                this.#logger.error(
                    `WebSocket error for user '${userId}' (Socket ID: ${socketId}) from namespace '${namespaceId}':`,
                    error,
                )
                if (handler.onError) {
                    handler.onError(namespaceId, ws, userId, error)
                }
            })
        })

        this.#wss.on('error', (error) => {
            this.#logger.error('WebSocket server error:', error)
        })
    }

    /**
     * Допоміжна функція для очищення внутрішніх мап при закритті сокета.
     * @private
     * @param {string} socketId - Унікальний ID сокета.
     * @param {string} userId - ID користувача.
     */
    #cleanUpSocket(socketId, userId) {
        this.#socketIdToNamespaceMap.delete(socketId)
        this.#socketIdToUserIdMap.delete(socketId)
        this.#socketIdToWsMap.delete(socketId)

        const userSocketIds = this.#userIdToSocketIdsMap.get(userId)
        if (userSocketIds) {
            userSocketIds.delete(socketId)
            if (userSocketIds.size === 0) {
                this.#userIdToSocketIdsMap.delete(userId)
            }
        }
        this.#socketIdToRoomIdsMap.delete(socketId) // Видаляємо всі кімнати, пов'язані з цим сокетом
    }

    /**
     * Екстрагує ідентифікатор простору імен з URL.
     * @param {string} urlPath - Шлях URL.
     * @returns {string} Ідентифікатор простору імен.
     * @private
     */
    #extractNamespaceId(urlPath) {
        if (!urlPath || urlPath === '/') {
            return 'default'
        }
        const parts = urlPath.split('/').filter(Boolean)
        return parts[0] || 'default'
    }

    /**
     * Екстрагує userId з параметрів URL.
     * У реальному застосунку це має бути зроблено через автентифікацію (наприклад, з токену).
     * @param {import('http').IncomingMessage} req - Об'єкт запиту Node.js.
     * @returns {string|null} ID користувача або null, якщо не знайдено.
     * @private
     */
    #extractUserIdFromUrl(req) {
        try {
            // Використовуємо req.protocol та req.headers.host для формування базового URL
            // Це надійніший спосіб, ніж просто 'http://localhost/'
            const protocol =
                req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')
            const host = req.headers.host || 'localhost' // Fallback to localhost if host header is missing
            const url = new URL(req.url, `${protocol}://${host}`)
            return url.searchParams.get('userId')
        } catch (e) {
            this.#logger.warn(`Failed to parse URL for userId from '${req.url}': ${e.message}`)
            return null
        }
    }

    /**
     * Реєструє обробник для конкретного простору імен.
     * @param {string} namespaceId - Ідентифікатор простору імен (наприклад, 'chat', 'game').
     * @param {object} handlers - Об'єкт з функціями-обробниками.
     * @param {function(namespaceId: string, ws: WebSocket, userId: string)} handlers.onConnect - Викликається при підключенні.
     * @param {function(namespaceId: string, ws: WebSocket, userId: string, message: any)} handlers.onMessage - Викликається при отриманні повідомлення.
     * @param {function(namespaceId: string, ws: WebSocket, userId: string)} handlers.onDisconnect - Викликається при відключенні.
     * @param {function(namespaceId: string, ws: WebSocket, userId: string, error: Error)} [handlers.onError] - Викликається при помилці.
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
                ((nsId, ws, userId, err) =>
                    this.#logger.error(`WS Error in ${nsId} for ${userId}:`, err)),
        })
        this.#logger.log(`Registered handler for namespace '${namespaceId}'.`)
    }

    /**
     * Додає ID сокета до списку кімнат, до яких він належить.
     * Це для *локального* відстеження, а не для сховища.
     * @param {string} socketId - Унікальний ID сокета.
     * @param {string} roomId - ID кімнати.
     */
    addSocketToRoom(socketId, roomId) {
        if (this.#socketIdToRoomIdsMap.has(socketId)) {
            this.#socketIdToRoomIdsMap.get(socketId).add(roomId)
            this.#logger.debug(
                `Socket ID '${socketId}' added to room '${roomId}'. Total rooms for socket: ${
                    this.#socketIdToRoomIdsMap.get(socketId).size
                }`,
            )
        } else {
            this.#logger.warn(
                `Attempted to add socket ID '${socketId}' to room '${roomId}', but socket not tracked.`,
            )
        }
    }

    /**
     * Видаляє ID сокета зі списку кімнат, до яких він належить.
     * Це для *локального* відстеження, а не для сховища.
     * @param {string} socketId - Унікальний ID сокета.
     * @param {string} roomId - ID кімнати.
     */
    removeSocketFromRoom(socketId, roomId) {
        if (this.#socketIdToRoomIdsMap.has(socketId)) {
            this.#socketIdToRoomIdsMap.get(socketId).delete(roomId)
            this.#logger.debug(
                `Socket ID '${socketId}' removed from room '${roomId}'. Total rooms for socket: ${
                    this.#socketIdToRoomIdsMap.get(socketId).size
                }`,
            )
        }
    }

    /**
     * Отримує список усіх кімнат, до яких належить певний сокет.
     * @param {string} socketId - Унікальний ID сокета.
     * @returns {Set<string>} Список ID кімнат.
     */
    getSocketRooms(socketId) {
        return this.#socketIdToRoomIdsMap.get(socketId) || new Set()
    }

    /**
     * Відправляє повідомлення конкретному WebSocket з'єднанню за його ID.
     * @param {string} socketId - Унікальний ID сокета.
     * @param {any} message - Повідомлення для відправки (буде серіалізовано в JSON).
     * @param {object} [options] - Опції для методу ws.send (наприклад, { binary: true, compress: false }).
     * @returns {boolean} True, якщо повідомлення було відправлено.
     */
    sendMessageToSocket(socketId, message, options) {
        const ws = this.#socketIdToWsMap.get(socketId)
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(message), options)
                return true
            } catch (e) {
                this.#logger.error(`Error sending message to socket ID '${socketId}':`, e)
                return false
            }
        } else {
            this.#logger.debug(
                `Failed to send message to socket ID '${socketId}': Connection not found or not open. Cleaning up.`,
            )
            // Якщо сокет не відкритий або не знайдений, очищаємо його.
            // Ми повинні отримати userId для коректного очищення.
            const userId = this.#socketIdToUserIdMap.get(socketId)
            if (userId) {
                this.#cleanUpSocket(socketId, userId)
            } else {
                // Якщо userId не знайдено, просто видаляємо сокет з основних мап
                this.#socketIdToNamespaceMap.delete(socketId)
                this.#socketIdToWsMap.delete(socketId)
                this.#socketIdToRoomIdsMap.delete(socketId)
            }
            return false
        }
    }

    /**
     * Відправляє повідомлення всім активним з'єднанням конкретного користувача.
     * @param {string} userId - ID користувача.
     * @param {any} message - Повідомлення для відправки (буде серіалізовано в JSON).
     * @param {object} [options] - Опції для методу ws.send.
     * @returns {boolean} True, якщо повідомлення було відправлено хоча б одному з'єднанню.
     */
    sendMessageToUser(userId, message, options) {
        const userSocketIds = this.#userIdToSocketIdsMap.get(userId)
        if (!userSocketIds || userSocketIds.size === 0) {
            this.#logger.warn(
                `Failed to send message to user '${userId}': No active connections found.`,
            )
            return false
        }

        let sent = false
        const msg = JSON.stringify(message)
        // Використовуємо Array.from() для створення копії Set,
        // щоб уникнути проблем, якщо Set змінюється під час ітерації (через видалення).
        for (const socketId of Array.from(userSocketIds)) {
            const ws = this.#socketIdToWsMap.get(socketId)
            if (ws && ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(msg, options)
                    sent = true
                } catch (e) {
                    this.#logger.error(
                        `Error sending message to user '${userId}' via socket ID '${socketId}':`,
                        e,
                    )
                }
            } else {
                this.#logger.debug(
                    `Skipping message to user '${userId}' socket ID '${socketId}': Not open. Cleaning up.`,
                )
                this.#cleanUpSocket(socketId, userId) // Очищаємо неактивний сокет
            }
        }
        if (!sent) {
            this.#logger.warn(`No messages sent to any connection for user '${userId}'.`)
        }
        return sent
    }

    /**
     * Відправляє повідомлення всім користувачам у заданому списку.
     * @param {Array<string>} userIds - Масив ID користувачів.
     * @param {any} message - Повідомлення для відправки (буде серіалізовано в JSON).
     * @param {object} [options] - Опції для методу ws.send.
     */
    broadcastToUsers(userIds, message, options) {
        const msg = JSON.stringify(message)
        userIds.forEach((userId) => {
            const userSocketIds = this.#userIdToSocketIdsMap.get(userId)
            if (userSocketIds) {
                // Використовуємо Array.from() для створення копії Set,
                // щоб уникнути проблем, якщо Set змінюється під час ітерації (через видалення).
                for (const socketId of Array.from(userSocketIds)) {
                    const ws = this.#socketIdToWsMap.get(socketId)
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        try {
                            ws.send(msg, options)
                        } catch (e) {
                            this.#logger.error(
                                `Error broadcasting message to user '${userId}' via socket ID '${socketId}':`,
                                e,
                            )
                        }
                    } else {
                        this.#logger.debug(
                            `Skipping broadcast to user '${userId}' socket ID '${socketId}': Not open. Cleaning up.`,
                        )
                        this.#cleanUpSocket(socketId, userId) // Очищаємо неактивний сокет
                    }
                }
            } else {
                this.#logger.debug(
                    `Skipping broadcast to user '${userId}': No active connections found.`,
                )
            }
        })
    }

    /**
     * Закриває WebSocket сервер.
     * @async
     */
    async close() {
        return new Promise((resolve, reject) => {
            this.#wss.close((err) => {
                if (err) {
                    this.#logger.error('Error closing WebSocket server:', err)
                    return reject(err)
                }
                this.#logger.log('WebSocket server closed.')
                // Очищаємо всі мапи при закритті сервера
                this.#namespaceHandlers.clear()
                this.#socketIdToNamespaceMap.clear()
                this.#socketIdToUserIdMap.clear()
                this.#userIdToSocketIdsMap.clear()
                this.#socketIdToRoomIdsMap.clear()
                this.#socketIdToWsMap.clear() // Очищаємо мапу посилань на об'єкти WebSocket
                resolve()
            })
        })
    }
}

export { WsAdapter }
