import { WebSocketServer } from 'ws'
import url from 'url'
import { v4 as uuidv4 } from 'uuid' // Для унікальних ID клієнтів
import logger from './logger.js'

/**
 * @typedef {Object} CustomWebSocket Розширений об'єкт WebSocket з додатковими властивостями.
 * @property {string} id - Унікальний ID клієнта.
 * @property {string} userId - ID користувача (з токена або запиту).
 * @property {string} username - Ім'я користувача (з токена або запиту).
 * @property {Set<string>} rooms - Набір кімнат, до яких приєднано цього клієнта.
 * @property {number} lastPongTime - Час останнього отриманого PONG-повідомлення.
 * @property {NodeJS.Timeout|null} pingTimeout - Таймер для перевірки PONG.
 * @property {NodeJS.Timeout|null} heartbeatInterval - Інтервал для надсилання PING.
 */

class RoomManager {
    constructor() {
        this.wss = null // Екземпляр WebSocketServer
        this.clients = new Map() // Map<clientId, CustomWebSocket>
        this.rooms = new Map() // Map<roomName, Set<clientId>>
        this.namespaces = new Map() // Map<namespacePath, { handleConnection, handleMessage, handleClose }>
        this.logger = logger

        // Налаштування PING/PONG
        this.PING_INTERVAL = 10000 // Надсилати PING кожні 10 секунд
        this.PONG_TIMEOUT = 5000 // Очікувати PONG 5 секунд
    }

    /**
     * Ініціалізує WebSocket сервер.
     * @param {import('http').Server} server - HTTP сервер, до якого буде прив'язано WebSocket сервер.
     */
    init(server) {
        this.wss = new WebSocketServer({ server })

        this.wss.on('connection', this.handleNewConnection.bind(this))
        this.wss.on('error', (error) => {
            this.logger.error('[RoomManager] WebSocketServer error:', error)
        })

        // Запуск Heartbeat
        setInterval(() => this.heartbeat(), this.PING_INTERVAL)
        this.logger.info('RoomManager initialized. WebSocket server listening.')
    }

    /**
     * Реєструє обробник для конкретного неймспейсу WebSocket.
     * @param {string} path - Шлях неймспейсу (наприклад, '/ws/chat').
     * @param {object} handlers - Об'єкт з функціями handleConnection, handleMessage, handleClose.
     * @param {function(CustomWebSocket): void} handlers.handleConnection
     * @param {function(CustomWebSocket, string | Buffer): void} handlers.handleMessage
     * @param {function(CustomWebSocket): void} handlers.handleClose
     */
    registerNamespace(path, handlers) {
        if (this.namespaces.has(path)) {
            this.logger.warn(`[RoomManager] Namespace "${path}" is already registered.`)
        }
        this.namespaces.set(path, handlers)
        this.logger.info(`[RoomManager] Namespace "${path}" registered.`)
    }

    /**
     * Обробляє нове WebSocket-з'єднання.
     * @param {WebSocket} ws - Raw WebSocket об'єкт.
     * @param {import('http').IncomingMessage} req - HTTP запит.
     */
    handleNewConnection(ws, req) {
        // Парсимо URL, щоб отримати шлях та параметри запиту (наприклад, токен)
        const parsedUrl = url.parse(req.url, true)
        const path = parsedUrl.pathname
        const token = parsedUrl.query.token // Припускаємо, що токен передається як query-параметр

        // --- Аутентифікація та авторизація (простий приклад) ---
        // У реальному проекті тут буде перевірка JWT або інший метод
        let userId = 'guest'
        let username = 'Anonymous'

        if (token) {
            // У цьому прикладі токен простий рядок "fake_token_userId_username"
            const tokenParts = token.split('_')
            if (tokenParts.length === 3 && tokenParts[0] === 'fake') {
                userId = tokenParts[1]
                username = tokenParts[2]
            } else {
                logger.warn(`[Auth] Invalid token format from ${req.socket.remoteAddress}`)
                ws.close(1008, 'Invalid token') // 1008 - Policy Violation
                return
            }
        } else {
            logger.warn(`[Auth] No token provided from ${req.socket.remoteAddress}`)
            ws.close(1008, 'Authentication required')
            return
        }

        /** @type {CustomWebSocket} */
        const customWs = ws
        customWs.id = uuidv4() // Генеруємо унікальний ID для кожного клієнта
        customWs.userId = userId
        customWs.username = username
        customWs.rooms = new Set() // Кімнати, до яких приєднано цього клієнта
        customWs.isAlive = true // Для Heartbeat
        customWs.lastPongTime = Date.now() // Час останнього PONG

        this.clients.set(customWs.id, customWs)
        this.logger.info(
            `[RoomManager] New client connected: ${customWs.username} (ID: ${customWs.id}) to path: ${path}`,
        )

        // Прив'язуємо обробники повідомлень та відключення
        customWs.on('message', (message) => {
            // Обробляємо PING/PONG на рівні RoomManager для heartbeat
            const parsed = this.parseJsonSafe(message.toString())
            if (parsed?.type === 'ping') {
                customWs.send(JSON.stringify({ type: 'pong' }))
                return // Не передаємо PING/PONG далі до обробника неймспейсу
            }
            if (parsed?.type === 'pong') {
                // На випадок, якщо клієнт посилає pong
                customWs.isAlive = true
                return
            }

            const namespaceHandler = this.namespaces.get(path)
            if (namespaceHandler && namespaceHandler.handleMessage) {
                namespaceHandler.handleMessage(customWs, message)
            } else {
                this.logger.warn(
                    `[RoomManager] No message handler for path ${path} or message type: ${parsed?.type}`,
                )
                customWs.send(
                    JSON.stringify({ type: 'ERROR', message: 'No handler for this message type.' }),
                )
            }
        })

        customWs.on('close', (code, reason) => this.handleClientClose(customWs, code, reason, path))
        customWs.on('error', (error) => {
            this.logger.error(
                `[RoomManager] Client ${customWs.username} (ID: ${customWs.id}) error:`,
                error,
            )
        })

        // Викликаємо обробник підключення для відповідного неймспейсу
        const namespaceHandler = this.namespaces.get(path)
        if (namespaceHandler && namespaceHandler.handleConnection) {
            namespaceHandler.handleConnection(customWs)
        } else {
            this.logger.warn(`[RoomManager] No connection handler for path ${path}.`)
            customWs.send(
                JSON.stringify({ type: 'ERROR', message: 'No service available at this path.' }),
            )
            customWs.close(1011, 'No service') // 1011 - Internal Error (or appropriate application-specific code)
        }
    }

    /**
     * Обробляє відключення клієнта.
     * @param {CustomWebSocket} ws - Об'єкт WebSocket клієнта.
     * @param {number} code - Код закриття.
     * @param {Buffer} reason - Причина закриття.
     * @param {string} path - Шлях неймспейсу, з якого відключився клієнт.
     */
    handleClientClose(ws, code, reason, path) {
        this.logger.info(
            `[RoomManager] Client disconnected: ${ws.username} (ID: ${
                ws.id
            }). Code: ${code}, Reason: ${reason.toString() || 'N/A'}`,
        )

        // Видаляємо клієнта з усіх кімнат, в яких він перебував
        // Повідомляємо кімнати про вихід клієнта (залежить від логіки неймспейсу)
        const clientRoomsCopy = new Set(ws.rooms) // Робимо копію, бо ws.rooms буде змінюватись
        for (const roomName of clientRoomsCopy) {
            this.leaveRoom(roomName, ws, false) // false, щоб не надсилати повідомлення про вихід на цьому етапі RoomManager
        }

        // Видаляємо клієнта з глобального списку
        this.clients.delete(ws.id)

        // Викликаємо обробник відключення для відповідного неймспейсу
        const namespaceHandler = this.namespaces.get(path)
        if (namespaceHandler && namespaceHandler.handleClose) {
            namespaceHandler.handleClose(ws) // Тут неймспейс може вирішити, кого оповіщати
        }
    }

    /**
     * Додає клієнта до кімнати.
     * @param {string} roomName - Назва кімнати.
     * @param {CustomWebSocket} ws - Об'єкт WebSocket клієнта.
     * @returns {Promise<void>}
     */
    async joinRoom(roomName, ws) {
        if (!this.rooms.has(roomName)) {
            this.rooms.set(roomName, new Set())
            this.logger.info(`[RoomManager] Created room: ${roomName}`)
        }
        const roomClients = this.rooms.get(roomName)
        if (!roomClients.has(ws.id)) {
            roomClients.add(ws.id)
            ws.rooms.add(roomName)
            this.logger.info(
                `[RoomManager] Client ${ws.username} (ID: ${ws.id}) joined room: ${roomName}`,
            )
        } else {
            this.logger.warn(
                `[RoomManager] Client ${ws.username} (ID: ${ws.id}) is already in room: ${roomName}`,
            )
        }
    }

    /**
     * Видаляє клієнта з кімнати.
     * @param {string} roomName - Назва кімнати.
     * @param {CustomWebSocket} ws - Об'єкт WebSocket клієнта.
     * @returns {Promise<void>}
     */
    async leaveRoom(roomName, ws) {
        const roomClients = this.rooms.get(roomName)
        if (roomClients && roomClients.has(ws.id)) {
            roomClients.delete(ws.id)
            ws.rooms.delete(roomName)
            this.logger.info(
                `[RoomManager] Client ${ws.username} (ID: ${ws.id}) left room: ${roomName}`,
            )
            if (roomClients.size === 0) {
                this.rooms.delete(roomName)
                this.logger.info(`[RoomManager] Room "${roomName}" is empty and deleted.`)
            }
        } else {
            this.logger.warn(
                `[RoomManager] Client ${ws.username} (ID: ${ws.id}) was not in room: ${roomName}`,
            )
        }
    }

    /**
     * Надсилає повідомлення всім клієнтам у вказаній кімнаті.
     * @param {string} roomName - Назва кімнати.
     * @param {object} messageData - Дані повідомлення (будуть перетворені на JSON).
     */
    async sendMessageToRoom(roomName, messageData) {
        const roomClients = this.rooms.get(roomName)
        if (roomClients) {
            const message = JSON.stringify(messageData)
            for (const clientId of roomClients) {
                const client = this.clients.get(clientId)
                if (client && client.readyState === client.OPEN) {
                    client.send(message)
                }
            }
        } else {
            this.logger.warn(
                `[RoomManager] Attempted to send message to non-existent room: ${roomName}`,
            )
        }
    }

    /**
     * Надсилає повідомлення конкретному клієнту.
     * @param {string} clientId - ID клієнта.
     * @param {object} messageData - Дані повідомлення.
     */
    async sendMessageToClient(clientId, messageData) {
        const client = this.clients.get(clientId)
        if (client && client.readyState === client.OPEN) {
            client.send(JSON.stringify(messageData))
        } else {
            this.logger.warn(
                `[RoomManager] Attempted to send message to non-existent or closed client: ${clientId}`,
            )
        }
    }

    /**
     * Повертає кількість клієнтів у кімнаті.
     * @param {string} roomName - Назва кімнати.
     * @returns {number} Кількість клієнтів.
     */
    getClientCount(roomName) {
        return this.rooms.has(roomName) ? this.rooms.get(roomName).size : 0
    }

    /**
     * Повертає інформацію про клієнтів у кімнаті.
     * @param {string} roomName - Назва кімнати.
     * @returns {Array<Pick<CustomWebSocket, 'id' | 'userId' | 'username'>>} Масив об'єктів клієнтів.
     */
    getRoomClientsInfo(roomName) {
        const clientsInfo = []
        const roomClients = this.rooms.get(roomName)
        if (roomClients) {
            for (const clientId of roomClients) {
                const client = this.clients.get(clientId)
                if (client) {
                    clientsInfo.push({
                        id: client.id,
                        userId: client.userId,
                        username: client.username,
                    })
                }
            }
        }
        return clientsInfo
    }

    /**
     * Перевіряє, чи клієнт знаходиться в кімнаті.
     * @param {string} roomName - Назва кімнати.
     * @param {string} clientId - ID клієнта.
     * @returns {boolean}
     */
    isClientInRoom(roomName, clientId) {
        const roomClients = this.rooms.get(roomName)
        return roomClients ? roomClients.has(clientId) : false
    }

    /**
     * Повертає список кімнат, до яких приєднано клієнта.
     * @param {string} clientId - ID клієнта.
     * @returns {Set<string> | undefined}
     */
    getClientRooms(clientId) {
        const client = this.clients.get(clientId)
        return client?.rooms
    }

    /**
     * Heartbeat механізм для перевірки активності клієнтів.
     * Надсилає PING і закриває з'єднання, якщо PONG не отримано.
     */
    heartbeat() {
        this.wss.clients.forEach((ws) => {
            /** @type {CustomWebSocket} */
            const customWs = ws
            if (customWs.isAlive === false) {
                this.logger.warn(
                    `[RoomManager] Terminating client due to heartbeat failure: ${customWs.username} (ID: ${customWs.id})`,
                )
                return customWs.terminate()
            }
            customWs.isAlive = false // Позначаємо як "неактивний" до отримання PONG
            customWs.ping() // Надсилаємо стандартний PING
        })
    }

    /**
     * Безпечно парсить JSON рядок.
     * @param {string} jsonString
     * @returns {object|null}
     */
    parseJsonSafe(jsonString) {
        try {
            return JSON.parse(jsonString)
        } catch (e) {
            // logger.error('Error parsing JSON:', e, 'String:', jsonString);
            return null
        }
    }
}

export const roomManager = new RoomManager()
