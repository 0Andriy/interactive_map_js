// src/websockets/WebSocketManager.js

import { WebSocketServer } from 'ws'
import WebSocketMessageHandler from './WebSocketMessageHandler.js' // <= Імпортуємо новий клас

/**
 * @typedef {Object} PredefinedRoomConfig
 * @property {string} name - Назва попередньо визначеної кімнати.
 * @property {Object} updates - Налаштування оновлень для кімнати.
 * @property {boolean} updates.enabled - Чи увімкнені періодичні оновлення.
 * @property {number} updates.intervalMs - Інтервал оновлення в мілісекундах.
 * @property {string} updates.dataSource - Назва методу в dbService для отримання даних.
 */

/**
 * @typedef {Object} WebSocketConfig - Об'єкт конфігурації для WebSocket.
 * @property {number} defaultRoomUpdateInterval - Інтервал оновлення за замовчуванням для динамічних кімнат (в мс).
 * @property {Array<PredefinedRoomConfig>} predefinedRooms - Масив об'єктів конфігурації для попередньо створених кімнат.
 * @property {string} [path='/ws'] - Шлях для WebSocketServer.
 */

/**
 * @typedef {Object} GlobalConfig - Об'єкт загальної конфігурації.
 * @property {WebSocketConfig} websocket - Конфігурація WebSocket.
 */

/**
 * @typedef {Object} Logger - Об'єкт логера з методами info, warn, error, debug.
 */

/**
 * @typedef {Object} DbService - Об'єкт сервісу бази даних з методами для отримання даних.
 * @property {function(string, Object): Promise<any>} getRoomData
 * @property {function(string): Promise<any>} getNewsFeedData
 * @property {function(string): Promise<any>} getOrderByOrderId
 * // Додайте інші методи, які використовуються
 */

/**
 * @typedef {Object} AuthResult
 * @property {boolean} isValid - Чи валідний токен.
 * @property {Object|null} payload - Декодований payload токена (наприклад, { userId: '...', roles: ['...'] }).
 */

/**
 * @typedef {Object} AuthService - Об'єкт сервісу автентифікації.
 * @property {function(string): Promise<AuthResult>} verifyToken
 */

/**
 * @typedef {Object} WebSocketManagerOptions - Опції для конструктора WebSocketManager.
 * @property {Logger} [logger] - Об'єкт кастомного логера.
 * @property {DbService} [dbService] - Об'єкт сервісу бази даних.
 * @property {AuthService} [authService] - Об'єкт сервісу автентифікації.
 * @property {WebSocketMessageHandler} [messageHandler] - Обробник вхідних повідомлень.
 * @property {GlobalConfig} [config] - Повна конфігурація WebSocketManager.
 */

/**
 * WebSocketManager відповідає за керування WebSocket-з'єднаннями,
 * обробку повідомлень, управління кімнатами та періодичне оновлення даних.
 */
class WebSocketManager {
    /**
     * Створює екземпляр WebSocketManager.
     * @param {import('http').Server | import('https').Server | Array<import('http').Server | import('https').Server>} httpServer - HTTP або HTTPS сервер(и).
     * @param {WebSocketManagerOptions} [options={}] - Об'єкт опцій для конфігурації WebSocketManager.
     */
    constructor(httpServer, options = {}) {
        if (!httpServer) {
            throw new Error('WebSocketManager requires an HTTP server instance.')
        }

        const { logger, dbService, authService, messageHandler, config } = options

        this.logger = logger || console
        this.dbService = dbService
        this.authService = authService
        this.config = config || {
            websocket: {
                defaultRoomUpdateInterval: 5000,
                predefinedRooms: [],
                path: '/ws', // Значення за замовчуванням
            },
        }

        // Ініціалізуємо обробник повідомлень. Якщо його не передали, створимо дефолтний.
        // Важливо: передаємо `this` (посилання на WebSocketManager) обробнику,
        // щоб обробник міг викликати методи `WebSocketManager`.
        this.messageHandler = messageHandler || new WebSocketMessageHandler(this)

        this.wss = new WebSocketServer({ server: httpServer, path: this.config.websocket.path })
        this.clients = new Map() // Map<userId, {ws: WebSocket, isAuthenticated: boolean, authPayload: Object, rooms: Set<string>}>
        this.rooms = new Map() // Map<roomName, Set<WebSocket>>
        this.roomUpdateIntervals = new Map() // Map<roomName, IntervalId>
        this.roomMetadata = new Map() // Map<roomName, {dataSourceMethod: string, dataParameters: Object}>

        this.logger.info(`WebSocketManager ініціалізовано на шляху: ${this.config.websocket.path}`)

        this._setupEventListeners()
        this._initializePredefinedRooms()
    }

    _setupEventListeners() {
        this.wss.on('connection', async (ws, request) => {
            ws.isAlive = true
            ws.on('pong', () => {
                ws.isAlive = true
            })

            const authPayload = await this._getAuthPayloadFromUrl(request.url)
            const userId = authPayload?.userId || `guest_${Date.now()}` // Використовуємо userId з токена або генеруємо для гостя
            const userRoles = authPayload?.roles || ['guest']

            ws.userId = userId
            ws.userRoles = userRoles
            ws.isAuthenticated = !!authPayload?.userId // Вважаємо автентифікованим, якщо є userId з токена

            this.clients.set(userId, {
                ws: ws,
                isAuthenticated: ws.isAuthenticated,
                authPayload: authPayload,
                rooms: new Set(),
            })
            this.logger.info(
                `[WS] Нове з'єднання: ${userId} (Автентифікований: ${ws.isAuthenticated})`,
            )

            if (ws.isAuthenticated) {
                this.sendMessage(ws, {
                    type: 'authSuccess',
                    message: 'Ви успішно автентифіковані.',
                    userId: userId,
                })
            } else {
                this.sendMessage(ws, {
                    type: 'authRequired',
                    message: 'Автентифікація необхідна для повного доступу.',
                    userId: userId,
                })
            }

            ws.on('message', async (message) => {
                await this.processWebSocketMessage(ws, message.toString())
            })

            ws.on('close', () => {
                this.logger.info(`[WS] З'єднання закрито для ${userId}`)
                this._removeClientFromAllRooms(ws)
                this.clients.delete(userId)
            })

            ws.on('error', (error) => {
                this.logger.error(`[WS] Помилка з'єднання для ${userId}:`, error.message)
            })
        })

        // Перевірка життєздатності з'єднань кожні 30 секунд
        setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (ws.isAlive === false) {
                    this.logger.warn(
                        `[WS] З'єднання ${ws.userId} не відповідає на пінг, завершення.`,
                    )
                    return ws.terminate()
                }
                ws.isAlive = false
                ws.ping()
            })
        }, 30000)
    }

    _initializePredefinedRooms() {
        this.config.websocket.predefinedRooms.forEach((roomConfig) => {
            this.rooms.set(roomConfig.name, new Set()) // Ініціалізуємо Set для кімнати
            this.roomMetadata.set(roomConfig.name, {
                dataSourceMethod: roomConfig.updates.dataSource,
                dataParameters: {}, // Попередньо визначені кімнати зазвичай не мають динамічних параметрів запиту
            })

            if (roomConfig.updates.enabled) {
                this.logger.info(
                    `[WebSocketManager] Запуск періодичного оновлення для попередньо визначеної кімнати: '${roomConfig.name}' з інтервалом ${roomConfig.updates.intervalMs} мс.`,
                )
                this.startRoomUpdates(roomConfig.name, roomConfig.updates.intervalMs)
            }
        })
    }

    /**
     * Додає клієнта до кімнати.
     * @param {Object} ws - Об'єкт WebSocket-з'єднання.
     * @param {string} roomName - Назва кімнати.
     * @param {string} [dataSourceMethod] - Метод DbService для отримання даних кімнати (для динамічних).
     * @param {Object} [dataParameters={}] - Додаткові параметри для dataSourceMethod.
     */
    joinClientToRoom(ws, roomName, dataSourceMethod, dataParameters = {}) {
        if (!this.rooms.has(roomName)) {
            this.rooms.set(roomName, new Set())
            this.roomMetadata.set(roomName, {
                dataSourceMethod: dataSourceMethod || 'getRoomData', // Метод за замовчуванням, якщо не вказано
                dataParameters: dataParameters,
            })
            this.logger.info(`[Room] Створено нову динамічну кімнату: '${roomName}'`)
        }

        const room = this.rooms.get(roomName)
        if (!room.has(ws)) {
            room.add(ws)
            const client = this.clients.get(ws.userId)
            if (client) {
                client.rooms.add(roomName)
            }
            this.logger.info(`[Room] Клієнт ${ws.userId} приєднався до кімнати '${roomName}'.`)
            this.sendMessage(ws, {
                type: 'joined',
                roomName: roomName,
                message: `Ви приєдналися до кімнати '${roomName}'.`,
            })

            // Запускаємо оновлення, якщо це перший клієнт у динамічній кімнаті і його ще немає в predefined
            if (
                !this.roomUpdateIntervals.has(roomName) &&
                !this.config.websocket.predefinedRooms.some(
                    (r) => r.name === roomName && r.updates.enabled,
                )
            ) {
                this.logger.info(
                    `[WebSocketManager] Запущено періодичне опитування для кімнати '${roomName}' з інтервалом ${this.config.websocket.defaultRoomUpdateInterval} мс.`,
                )
                this.startRoomUpdates(roomName, this.config.websocket.defaultRoomUpdateInterval)
            } else {
                this.logger.debug(
                    `[WebSocketManager] Кімната '${roomName}' не потребує запуску періодичного опитування при приєднанні клієнта.`,
                )
            }
        } else {
            this.logger.warn(`[Room] Клієнт ${ws.userId} вже знаходиться в кімнаті '${roomName}'.`)
            this.sendError(ws, 'join', `Ви вже перебуваєте в кімнаті '${roomName}'.`)
        }
    }

    /**
     * Видаляє клієнта з кімнати.
     * @param {Object} ws - Об'єкт WebSocket-з'єднання.
     * @param {string} roomName - Назва кімнати.
     */
    leaveClientFromRoom(ws, roomName) {
        const room = this.rooms.get(roomName)
        if (room && room.has(ws)) {
            room.delete(ws)
            const client = this.clients.get(ws.userId)
            if (client) {
                client.rooms.delete(roomName)
            }
            this.logger.info(`[Room] Клієнт ${ws.userId} покинув кімнату '${roomName}'.`)
            this.sendMessage(ws, {
                type: 'left',
                roomName: roomName,
                message: `Ви покинули кімнату '${roomName}'.`,
            })

            // Якщо кімната спорожніла і вона не є попередньо визначеною, зупиняємо оновлення та видаляємо її
            if (
                room.size === 0 &&
                !this.config.websocket.predefinedRooms.some((r) => r.name === roomName)
            ) {
                this.stopRoomUpdates(roomName)
                this.rooms.delete(roomName)
                this.roomMetadata.delete(roomName)
                this.logger.info(
                    `[Room] Динамічна кімната '${roomName}' спорожніла і була видалена.`,
                )
            }
        } else {
            this.logger.warn(`[Room] Клієнт ${ws.userId} не знаходиться в кімнаті '${roomName}'.`)
            this.sendError(ws, 'leave', `Ви не перебуваєте в кімнаті '${roomName}'.`)
        }
    }

    /**
     * Надсилає повідомлення всім клієнтам у вказаній кімнаті.
     * @param {string} roomName - Назва кімнати.
     * @param {Object} message - Об'єкт повідомлення для надсилання.
     */
    sendToRoom(roomName, message) {
        const room = this.rooms.get(roomName)
        if (room) {
            const messageString = JSON.stringify(message)
            room.forEach((ws) => {
                if (ws.readyState === ws.OPEN) {
                    ws.send(messageString)
                }
            })
            this.logger.debug(`[WS-TX] Надіслано в кімнату '${roomName}':`, message.type)
        } else {
            this.logger.warn(
                `[Room] Спроба надіслати повідомлення в неіснуючу кімнату: '${roomName}'.`,
            )
        }
    }

    /**
     * Надсилає повідомлення одному конкретному клієнту.
     * @param {Object} ws - Об'єкт WebSocket-з'єднання.
     * @param {Object} message - Об'єкт повідомлення.
     */
    sendMessage(ws, message) {
        if (ws && ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(message))
            this.logger.debug(`[WS-TX] Надіслано клієнту ${ws.userId}:`, message.type)
        }
    }

    /**
     * Надсилає повідомлення про помилку клієнту.
     * @param {Object} ws - Об'єкт WebSocket-з'єднання.
     * @param {string} code - Код помилки (для ідентифікації на клієнті).
     * @param {string} message - Повідомлення про помилку.
     */
    sendError(ws, code, message) {
        this.sendMessage(ws, { type: 'error', code: code, message: message })
    }

    /**
     * Перевіряє, чи клієнт є учасником кімнати.
     * @param {Object} ws - Об'єкт WebSocket-з'єднання.
     * @param {string} roomName - Назва кімнати.
     * @returns {boolean} - True, якщо клієнт у кімнаті, інакше False.
     */
    isClientInRoom(ws, roomName) {
        const room = this.rooms.get(roomName)
        return room && room.has(ws)
    }

    /**
     * Запускає періодичне оновлення даних для кімнати.
     * @param {string} roomName - Назва кімнати.
     * @param {number} intervalMs - Інтервал оновлення в мілісекундах.
     */
    startRoomUpdates(roomName, intervalMs) {
        if (this.roomUpdateIntervals.has(roomName)) {
            this.logger.warn(`[WebSocketManager] Оновлення для кімнати '${roomName}' вже запущені.`)
            return
        }
        const intervalId = setInterval(() => {
            this._broadcastPeriodicUpdate(roomName)
        }, intervalMs)
        this.roomUpdateIntervals.set(roomName, intervalId)
    }

    /**
     * Зупиняє періодичне оновлення даних для кімнати.
     * @param {string} roomName - Назва кімнати.
     */
    stopRoomUpdates(roomName) {
        const intervalId = this.roomUpdateIntervals.get(roomName)
        if (intervalId) {
            clearInterval(intervalId)
            this.roomUpdateIntervals.delete(roomName)
            this.logger.info(
                `[WebSocketManager] Зупинено періодичне опитування для кімнати '${roomName}'.`,
            )
        }
    }

    /**
     * Отримує дані з DbService та розсилає їх клієнтам кімнати.
     * @param {string} roomName - Назва кімнати.
     * @private
     */
    async _broadcastPeriodicUpdate(roomName) {
        const room = this.rooms.get(roomName)
        if (!room || room.size === 0) {
            // Якщо кімната спорожніла (наприклад, всі клієнти відключились)
            // і це не predefined кімната, то зупиняємо її оновлення
            if (!this.config.websocket.predefinedRooms.some((r) => r.name === roomName)) {
                this.stopRoomUpdates(roomName)
                this.rooms.delete(roomName)
                this.roomMetadata.delete(roomName)
                this.logger.info(
                    `[Room] Динамічна кімната '${roomName}' спорожніла і була видалена.`,
                )
            }
            return
        }

        const metadata = this.roomMetadata.get(roomName)
        if (
            !metadata ||
            !this.dbService ||
            typeof this.dbService[metadata.dataSourceMethod] !== 'function'
        ) {
            this.logger.error(
                `[WebSocketManager] Не знайдено DbService або метод '${metadata?.dataSourceMethod}' для кімнати '${roomName}'.`,
            )
            return
        }

        try {
            const data = await this.dbService[metadata.dataSourceMethod](
                roomName,
                metadata.dataParameters,
            )
            this.sendToRoom(roomName, {
                type: 'periodicUpdate',
                data: { room: roomName, data: data },
            })
            this.logger.debug(`[WebSocketManager] Оновлено дані для кімнати '${roomName}'.`)
        } catch (error) {
            this.logger.error(
                `[WebSocketManager] Помилка отримання даних для кімнати '${roomName}':`,
                error.message,
            )
            // Можливо, повідомити клієнтів про помилку
            this.sendToRoom(roomName, {
                type: 'error',
                code: 'dataUpdateFailed',
                message: `Помилка отримання даних для кімнати '${roomName}'.`,
            })
        }
    }

    /**
     * Видаляє клієнта з усіх кімнат при відключенні.
     * @param {Object} ws - Об'єкт WebSocket-з'єднання.
     * @private
     */
    _removeClientFromAllRooms(ws) {
        const client = this.clients.get(ws.userId)
        if (client && client.rooms) {
            client.rooms.forEach((roomName) => {
                const room = this.rooms.get(roomName)
                if (room) {
                    room.delete(ws)
                    // Якщо динамічна кімната спорожніла, зупиняємо оновлення та видаляємо її
                    if (
                        room.size === 0 &&
                        !this.config.websocket.predefinedRooms.some((r) => r.name === roomName)
                    ) {
                        this.stopRoomUpdates(roomName)
                        this.rooms.delete(roomName)
                        this.roomMetadata.delete(roomName)
                        this.logger.info(
                            `[Room] Динамічна кімната '${roomName}' спорожніла і була видалена.`,
                        )
                    }
                }
            })
        }
    }

    /**
     * Отримує Payload автентифікації з URL-запиту.
     * @param {string} url - URL-запит з WebSocket.
     * @returns {Promise<Object|null>} - Payload токена або null, якщо токен невалідний.
     * @private
     */
    async _getAuthPayloadFromUrl(url) {
        const params = new URLSearchParams(url.split('?')[1])
        const token = params.get('token')

        if (token && this.authService) {
            try {
                const authResult = await this.authService.verifyToken(token)
                if (authResult.isValid) {
                    return authResult.payload
                } else {
                    this.logger.warn(`[Auth] Невалідний токен: ${token}`)
                    return null
                }
            } catch (error) {
                this.logger.error(`[Auth] Помилка верифікації токена: ${error.message}`)
                return null
            }
        }
        return null // Немає токена або authService
    }
}

export default WebSocketManager
