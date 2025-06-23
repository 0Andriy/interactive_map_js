// src/websockets/WebSocketManager.js

import { WebSocketServer } from 'ws'
import { URL } from 'url'

/**
 * @typedef {Object} WebSocketClientExtension - Розширення для об'єкта WebSocket
 * @property {string} userId - ID користувача, пов'язаний зі з'єднанням.
 * @property {boolean} isAuthenticated - Прапор, що вказує, чи автентифікований клієнт.
 * @property {Set<string>} rooms - Набір назв кімнат, до яких приєднаний клієнт.
 * @property {number} lastPong - Мітка часу останнього отриманого PONG повідомлення.
 * @property {NodeJS.Timeout} pingInterval - Ідентифікатор інтервалу для PING-PONG механізму.
 */

/**
 * @typedef {WebSocket & WebSocketClientExtension} AuthenticatedWebSocket - WebSocket клієнт з додатковими властивостями.
 */

/**
 * @typedef {Object} Logger - Об'єкт логера з різними рівнями.
 * @property {(message?: any, ...optionalParams: any[]) => void} debug
 * @property {(message?: any, ...optionalParams: any[]) => void} info
 * @property {(message?: any, ...optionalParams: any[]) => void} warn
 * @property {(message?: any, ...optionalParams: any[]) => void} error
 */

/**
 * @typedef {Object} DbService - Об'єкт сервісу бази даних.
 * @property {(roomName: string, params?: Object) => Promise<any[]>} getRoomData - Метод для отримання загальних даних кімнати.
 * @property {(roomName?: string, params?: Object) => Promise<any[]>} [getNewsFeedData] - Метод для отримання новин.
 * @property {(roomName?: string, params?: Object) => Promise<any[]>} [getMarketData] - Метод для отримання ринкових даних.
 * @property {(roomName?: string, params?: Object) => Promise<any>} [getSystemStatus] - Метод для отримання статусу системи.
 * @property {(orderId: string) => Promise<any[]>} [getOrderByOrderId] - Метод для отримання даних замовлення.
 * @property {(sessionId: string) => Promise<any[]>} [getGameSessionDetails] - Метод для отримання даних ігрової сесії.
 * // Додайте інші методи, які використовуються як dataSource
 */

/**
 * @typedef {Object} AuthService - Об'єкт сервісу автентифікації.
 * @property {(token: string) => Promise<{ isValid: boolean, payload: object | null }>} verifyToken - Метод для перевірки JWT токена.
 */

/**
 * @typedef {Object} RoomUpdateConfig - Об'єкт конфігурації для періодичних оновлень кімнати.
 * @property {boolean} enabled - Чи увімкнені автоматичні оновлення для цієї кімнати.
 * @property {number} intervalMs - Інтервал оновлення для цієї кімнати в мілісекундах.
 * @property {string} dataSource - Назва методу в `dbService` для отримання даних для цієї кімнати.
 */

/**
 * @typedef {Object} PredefinedRoomConfig - Об'єкт конфігурації попередньо визначеної кімнати.
 * @property {string} name - Назва кімнати.
 * @property {RoomUpdateConfig} [updates] - Налаштування для періодичних оновлень кімнати.
 */

/**
 * @typedef {Object} WebSocketConfig - Об'єкт конфігурації для WebSocket.
 * @property {string} [path='/ws'] - Шлях для WebSocketServer
 * @property {number} defaultRoomUpdateInterval - Інтервал оновлення за замовчуванням для динамічних кімнат (в мс).
 * @property {Array<PredefinedRoomConfig>} predefinedRooms - Масив об'єктів конфігурації для попередньо створених кімнат.
 */

/**
 * @typedef {Object} GlobalConfig - Об'єкт загальної конфігурації.
 * @property {WebSocketConfig} websocket - Конфігурація WebSocket.
 */

/**
 * WebSocketManager відповідає за керування WebSocket-з'єднаннями,
 * організацію кімнат, обробку вхідних повідомлень та періодичні оновлення даних.
 * Він інкапсулює всю логіку, пов'язану з WebSockets, для чистоти та модульності коду.
 */
class WebSocketManager {
    /**
     * Створює екземпляр WebSocketManager.
     * @param {import('http').Server | import('https').Server | Array<import('http').Server | import('https').Server>} httpServer - HTTP або HTTPS сервер(и).
     * @param {Object} [options={}] - Об'єкт опцій для конфігурації WebSocketManager.
     * @param {string} [options.wsPath='/ws'] - Шлях для WebSocketServer.
     * @param {Logger} [options.logger] - Об'єкт кастомного логера.
     * @param {DbService} [options.dbService] - Об'єкт сервісу бази даних.
     * @param {AuthService} [options.authService] - Об'єкт сервісу автентифікації.
     * @param {GlobalConfig} [options.config] - Повна конфігурація WebSocketManager.
     */
    constructor(httpServer, options = {}) {
        if (!httpServer) {
            throw new Error('WebSocketManager requires an HTTP server instance.')
        }

        const { logger, dbService, authService, config } = options

        /**
         * Об'єкт логера, що використовується для виведення інформації, попереджень та помилок.
         * Якщо кастомний логер не надано, використовується консольний логер за замовчуванням
         * з додаванням міток часу до кожного повідомлення.
         * @type {Logger}
         */
        this.logger = logger || {
            debug: (...args) => console.debug(`[DEBUG][${new Date().toISOString()}]`, ...args),
            info: (...args) => console.log(`[INFO][${new Date().toISOString()}]`, ...args),
            warn: (...args) => console.log(`[WARN][${new Date().toISOString()}]`, ...args),
            error: (...args) => console.error(`[ERROR][${new Date().toISOString()}]`, ...args),
        }

        /**
         * Зберігає загальні конфігураційні налаштування для WebSocketManager.
         * Ці налаштування включають:
         * - `defaultRoomUpdateInterval`: Інтервал оновлення за замовчуванням для динамічних кімнат (в мс).
         * - `predefinedRooms`: Масив об'єктів конфігурації для попередньо визначених (статичних) кімнат,
         * які існують незалежно від підключення клієнтів. Кожен об'єкт містить:
         * - `name`: Назва кімнати (string).
         * - `updates`: Об'єкт налаштувань для періодичних оновлень кімнати:
         * - `enabled`: Чи увімкнені автоматичні оновлення для цієї кімнати (boolean).
         * - `intervalMs`: Специфічний інтервал оновлення для цієї кімнати (number, в мс).
         * - `dataSource`: Назва методу в `dbService` для отримання даних для цієї кімнати (string).
         * @type {GlobalConfig}
         */
        this.config = config || {
            websocket: {
                wsPath: '/ws',
                defaultRoomUpdateInterval: 5000,
                predefinedRooms: [],
            },
        }

        if (!dbService || typeof dbService.getRoomData !== 'function') {
            this.logger.warn(
                'dbService не надано або не має методу getRoomData. Використовується заглушка DbService.',
            )

            /**
             * Об'єкт сервісу бази даних (DbService).
             * Якщо кастомний dbService не надано або не має getRoomData, створюється заглушка.
             * Заглушка за замовчуванням включає лише getRoomData.
             * Всі інші методи, якщо вони потрібні, мають бути надані через 'dbService' у 'options'.
             * @type {DbService}
             */
            this.dbService = {
                getRoomData: async (roomName, params) => {
                    this.logger.debug(
                        `[DbService Mock] Запит до 'getRoomData' для кімнати '${roomName}' з параметрами:`,
                        params,
                    )
                    return []
                },
            }

            // Якщо dbService було надано, але без getRoomData, копіюємо решту його методів.
            // Це дозволяє користувачу надати свій dbService, в якому є customGetUsers або інші методи,
            // навіть якщо getRoomData відсутній (і буде замінений заглушкою).
            if (dbService && typeof dbService === 'object') {
                for (const key in dbService) {
                    if (typeof dbService[key] === 'function' && !this.dbService[key]) {
                        this.dbService[key] = dbService[key]
                        this.logger.debug(
                            `[DbService Mock] Додано користувацький метод '${key}' з наданого dbService.`,
                        )
                    }
                }
            }
        } else {
            /**
             * Об'єкт сервісу бази даних (DbService).
             * Використовується наданий користувачем об'єкт dbService.
             * @type {DbService}
             */
            this.dbService = dbService
        }

        if (!authService || typeof authService.verifyToken !== 'function') {
            this.logger.error(
                'authService не надано або не має методу verifyToken. Автентифікація WebSocket не працюватиме належним чином.',
            )
            this.authService = {
                verifyToken: () => {
                    throw new Error('Auth service not configured')
                },
            }
        } else {
            this.authService = authService
        }

        /**
         * Об'єкт для роботи з самими вебсокетами
         * @type {Map<string, AuthenticatedWebSocket>}
         */
        this.wss = new WebSocketServer({ server: httpServer, path: this.config.websocket.path })
        this.logger.info(`WebSocketManager ініціалізовано на шляху: ${this.config.websocket.path}`)

        /**
         * Карта для відстеження всіх підключених клієнтів за userId.
         * @type {Map<string, AuthenticatedWebSocket>}
         */
        this.clients = new Map()

        /**
         * Карта для керування кімнатами: RoomName -> Set<WebSocket>.
         * @type {Map<string, Set<AuthenticatedWebSocket>>}
         */
        this.rooms = new Map()

        /**
         * Карта для зберігання ідентифікаторів інтервалів оновлення кімнат.
         * Key: назва кімнати, Value: NodeJS.Timeout ідентифікатор.
         * @type {Map<string, NodeJS.Timeout>}
         */
        this.roomUpdateIntervals = new Map()

        /**
         * Містить конфігурацію лише для попередньо визначених кімнат,
         * витягнуту з `this.config.websocket.predefinedRooms` для зручності доступу.
         * Цей масив використовується для ініціалізації та керування статичними кімнатами.
         * @type {Array<PredefinedRoomConfig>}
         */
        this.predefinedRoomsConfig = this.config.websocket.predefinedRooms

        /**
         * Карта для зберігання метаданих динамічних кімнат, таких як параметри для запитів до БД.
         * Ключ: roomName, Значення: Об'єкт з параметрами (наприклад, { dataParameters: {}, dataSourceMethod: '...' }).
         * @type {Map<string, Object>}
         */
        this.roomMetadata = new Map()

        this.setupEventListeners()

        // Ініціалізація попередньо визначених кімнат при старті застосунку
        // Вони будуть запущені, але запити до БД будуть виконуватися лише за наявності клієнтів.
        this.initializePredefinedRooms()
    }

    /**
     * Налаштовує обробники подій для WebSocket сервера та окремих з'єднань.
     * @private
     */
    setupEventListeners() {
        this.wss.on('connection', this.handleConnection.bind(this))
        this.wss.on('error', this.handleServerError.bind(this))
        this.wss.on('listening', () => {
            this.logger.info("WebSocketServer запущений і слухає з'єднання.")
        })
        this.wss.on('close', () => {
            this.logger.info('WebSocketServer закрито.')
            // Очистка всіх інтервалів оновлення кімнат
            this.roomUpdateIntervals.forEach((intervalId) => clearInterval(intervalId))
            this.roomUpdateIntervals.clear()
            this.clients.forEach((client) => {
                // Зупиняємо PING-інтервали для всіх клієнтів
                if (client.pingInterval) clearInterval(client.pingInterval)
            })
            this.clients.clear()
            this.rooms.clear()
            this.roomMetadata.clear()
        })
    }

    /**
     * Обробляє нові WebSocket-з'єднання.
     * @param {WebSocket} ws - Нове WebSocket-з'єднання.
     * @param {import('http').IncomingMessage} req - Об'єкт вхідного HTTP-запиту.
     * @returns {Promise<void>}
     * @private
     */
    async handleConnection(ws, req) {
        const query = new URL(req.url, `http://${req.headers.host}`).searchParams
        const token = query.get('token')

        /** @type {AuthenticatedWebSocket} */
        const authenticatedWs = /** @type {AuthenticatedWebSocket} */ (ws)
        authenticatedWs.isAuthenticated = false
        authenticatedWs.userId = `unauthenticated_${Math.random().toString(36).substring(2, 9)}` // Початкове значення з унікальним ID
        authenticatedWs.rooms = new Set() // Ініціалізація Set для кімнат

        if (token) {
            try {
                const { isValid, payload } = await this.authService.verifyToken(token)
                if (isValid && payload && payload.userId) {
                    authenticatedWs.userId = payload.userId
                    authenticatedWs.isAuthenticated = true
                    // Перевіряємо, чи вже існує з'єднання для цього userId, і закриваємо старе
                    if (this.clients.has(authenticatedWs.userId)) {
                        const oldWs = this.clients.get(authenticatedWs.userId)
                        if (oldWs && oldWs.readyState === oldWs.OPEN) {
                            this.logger.warn(
                                `Закриття старого з'єднання для користувача ${authenticatedWs.userId} (нове підключення).`,
                            )
                            oldWs.close(1000, 'New connection established')
                        }
                    }
                    this.clients.set(authenticatedWs.userId, authenticatedWs) // Додаємо до списку клієнтів
                    this.logger.info(
                        `Користувач ${authenticatedWs.userId} успішно автентифікований та підключений.`,
                    )
                    authenticatedWs.send(
                        JSON.stringify({ type: 'authSuccess', userId: authenticatedWs.userId }),
                    )
                } else {
                    authenticatedWs.send(
                        JSON.stringify({
                            type: 'authError',
                            message: 'Недійсний або прострочений токен.',
                        }),
                    )
                    authenticatedWs.close(1008, 'Invalid token')
                    this.logger.warn(
                        `Спроба підключення з недійсним токеном. IP: ${req.socket.remoteAddress}`,
                    )
                    return
                }
            } catch (error) {
                authenticatedWs.send(
                    JSON.stringify({ type: 'authError', message: 'Помилка автентифікації.' }),
                )
                authenticatedWs.close(1008, 'Authentication error')
                this.logger.error(
                    `Помилка автентифікації для IP ${req.socket.remoteAddress}:`,
                    error,
                )
                return
            }
        } else {
            authenticatedWs.send(
                JSON.stringify({
                    type: 'authRequired',
                    message:
                        'Токен автентифікації відсутній. Підключення лише для обмежених операцій.',
                }),
            )
            this.logger.warn(
                `Неавтентифіковане підключення з IP: ${req.socket.remoteAddress} (тимчасовий ID: ${authenticatedWs.userId})`,
            )
            // Дозволяємо неавтентифіковані з'єднання, але з обмеженими можливостями.
            // Їх userId буде 'unauthenticated_...'
        }

        authenticatedWs.lastPong = Date.now() // Ініціалізуємо час останнього PONG

        authenticatedWs.on('message', (message) => this.handleMessage(authenticatedWs, message))
        authenticatedWs.on('close', (code, reason) =>
            this.handleDisconnect(authenticatedWs, code, reason),
        )
        authenticatedWs.on('error', (error) => this.handleClientError(authenticatedWs, error))
        authenticatedWs.on('pong', () => {
            authenticatedWs.lastPong = Date.now() // Оновлюємо час останнього PONG
            this.logger.debug(`[PING/PONG] Отримано PONG від ${authenticatedWs.userId}`)
        })

        // Запускаємо відправку PING для підтримки з'єднання живим
        this.startPingInterval(authenticatedWs)
    }

    /**
     * Ініціалізує попередньо визначені кімнати при запуску застосунку
     * та налаштовує їхні періодичні оновлення.
     * Оновлення будуть запускатися, але запити до БД будуть виконуватися лише,
     * якщо в кімнаті є активні клієнти.
     * @private
     */
    initializePredefinedRooms() {
        this.predefinedRoomsConfig.forEach((roomConfig) => {
            const { name: roomName, updates } = roomConfig

            // Створюємо кімнату в мапі rooms, навіть якщо вона порожня
            if (!this.rooms.has(roomName)) {
                this.rooms.set(roomName, new Set())
                this.logger.info(`Попередньо створена кімната '${roomName}' ініціалізована.`)
            }

            // Якщо для кімнати увімкнені оновлення, запускаємо їх.
            // Важливо: фактичний запит до БД буде лише при наявності клієнтів.
            if (updates && updates.enabled) {
                this.startRoomUpdates(roomName, updates.intervalMs, updates.dataSource)
                this.logger.info(
                    `Періодичне опитування бази даних налаштовано для попередньо визначеної кімнати '${roomName}'.`,
                )
            }
        })
    }

    /**
     * Обробляє вхідні повідомлення від WebSocket-клієнтів.
     * @param {AuthenticatedWebSocket} ws - WebSocket-клієнт, що відправив повідомлення.
     * @param {import('ws').RawData} message - Сирі дані повідомлення.
     * @private
     */
    handleMessage(ws, message) {
        let parsedMessage
        try {
            parsedMessage = JSON.parse(message.toString())
        } catch (error) {
            this.logger.warn(`Недійсний JSON від ${ws.userId}:`, message.toString())
            ws.send(
                JSON.stringify({
                    type: 'error',
                    message: 'Недійсний формат повідомлення (очікується JSON).',
                }),
            )
            return
        }

        this.logger.debug(`Отримано повідомлення від ${ws.userId}:`, parsedMessage)

        // Перевірка автентифікації для певних команд
        // Дозволяємо 'ping' та 'join' без автентифікації для гнучкості,
        // але 'chatMessage' та інші дії вимагатимуть її.
        if (!ws.isAuthenticated && parsedMessage.type !== 'ping' && parsedMessage.type !== 'join') {
            ws.send(
                JSON.stringify({ type: 'error', message: 'Потрібна автентифікація для цієї дії.' }),
            )
            return
        }

        this.processWebSocketMessage(ws, parsedMessage)
    }

    /**
     * Обробляє різні типи вхідних повідомлень від WebSocket-клієнтів.
     * @param {AuthenticatedWebSocket} ws - WebSocket-клієнт, що відправив повідомлення.
     * @param {Object} message - Розпарсований JSON-об'єкт повідомлення.
     * @private
     */
    processWebSocketMessage(ws, message) {
        switch (message.type) {
            case 'chatMessage':
                // Перевірка автентифікації для чату
                if (!ws.isAuthenticated) {
                    ws.send(
                        JSON.stringify({
                            type: 'error',
                            message: 'Для відправки повідомлень у чат потрібна автентифікація.',
                        }),
                    )
                    return
                }
                if (message.roomName && message.text) {
                    // Надсилаємо повідомлення усім у кімнаті, включаючи відправника
                    this.sendMessageToRoom(message.roomName, {
                        type: 'chatMessage',
                        sender: ws.userId,
                        text: message.text,
                        timestamp: new Date().toISOString(),
                    })
                } else {
                    ws.send(
                        JSON.stringify({
                            type: 'error',
                            message: 'Для chatMessage потрібні roomName та text.',
                        }),
                    )
                }
                break
            case 'join':
                if (message.roomName) {
                    // Зберігаємо dataParameters та dataSourceMethod для динамічних кімнат, якщо вони надані
                    if (message.dataParameters || message.dataSourceMethod) {
                        const roomMeta = this.roomMetadata.get(message.roomName) || {}
                        roomMeta.dataParameters = message.dataParameters || roomMeta.dataParameters
                        roomMeta.dataSourceMethod =
                            message.dataSourceMethod || roomMeta.dataSourceMethod || 'getRoomData'
                        this.roomMetadata.set(message.roomName, roomMeta)
                        this.logger.debug(
                            `Метадані для кімнати '${message.roomName}' оновлено:`,
                            roomMeta,
                        )
                    }
                    this.joinRoom(ws, message.roomName)
                } else {
                    ws.send(
                        JSON.stringify({
                            type: 'error',
                            message: 'Для join потрібна назва кімнати.',
                        }),
                    )
                }
                break
            case 'leave':
                if (message.roomName) {
                    this.leaveRoom(ws, message.roomName)
                } else {
                    ws.send(
                        JSON.stringify({
                            type: 'error',
                            message: 'Для leave потрібна назва кімнати.',
                        }),
                    )
                }
                break
            case 'ping':
                // При отриманні ping від клієнта, відправляємо pong
                ws.pong()
                ws.lastPong = Date.now() // Оновлюємо час останнього PONG вручну
                this.logger.debug(
                    `[PING/PONG] Відправлено PONG у відповідь на PING від ${ws.userId}`,
                )
                break
            default:
                ws.send(
                    JSON.stringify({
                        type: 'error',
                        message: `Невідомий тип повідомлення: ${message.type}`,
                    }),
                )
                this.logger.warn(`Невідомий тип повідомлення від ${ws.userId}:`, message.type)
        }
    }

    /**
     * Обробляє відключення WebSocket-клієнта.
     * @param {AuthenticatedWebSocket} ws - Відключений WebSocket-клієнт.
     * @param {number} code - Код відключення.
     * @param {Buffer} reason - Причина відключення.
     * @private
     */
    handleDisconnect(ws, code, reason) {
        this.logger.info(
            `Користувач ${ws.userId} відключився. Код: ${code}, Причина: ${reason.toString()}`,
        )

        // Видаляємо клієнта з усіх кімнат, до яких він приєднаний
        if (ws.rooms) {
            ws.rooms.forEach((roomName) => {
                this.leaveRoom(ws, roomName, false) // false, щоб не надсилати повідомлення про вихід (буде очищено з кімнати)
            })
        }

        // Видаляємо клієнта зі списку всіх клієнтів
        if (ws.userId && this.clients.has(ws.userId)) {
            this.clients.delete(ws.userId)
        }

        // Зупиняємо PING інтервал для цього клієнта
        if (ws.pingInterval) {
            clearInterval(ws.pingInterval)
        }
    }

    /**
     * Обробляє помилки WebSocket-клієнта.
     * @param {AuthenticatedWebSocket} ws - WebSocket-клієнт, на якому сталася помилка.
     * @param {Error} error - Об'єкт помилки.
     * @private
     */
    handleClientError(ws, error) {
        this.logger.error(`Помилка WebSocket клієнта ${ws.userId}:`, error)
        // Додатково можна відправити повідомлення про помилку клієнту, якщо з'єднання ще відкрите
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: 'Виникла помилка на сервері.' }))
        }
    }

    /**
     * Обробляє помилки WebSocket сервера.
     * @param {Error} error - Об'єкт помилки.
     * @private
     */
    handleServerError(error) {
        this.logger.error('Помилка WebSocket сервера:', error)
    }

    /**
     * Додає WebSocket-клієнта до вказаної кімнати.
     * Запускає періодичні оновлення, якщо це перший клієнт у кімнаті,
     * або якщо кімната predefined і оновлення увімкнені (але запити до БД будуть лише при наявності клієнтів).
     * @param {AuthenticatedWebSocket} ws - WebSocket-клієнт, що приєднується.
     * @param {string} roomName - Назва кімнати, до якої приєднатися.
     */
    joinRoom(ws, roomName) {
        if (!roomName) {
            this.logger.warn(
                `Користувач ${ws.userId} намагається приєднатися до кімнати без імені.`,
            )
            ws.send(
                JSON.stringify({
                    type: 'error',
                    message: 'Необхідна назва кімнати для приєднання.',
                }),
            )
            return
        }
        if (!this.rooms.has(roomName)) {
            this.rooms.set(roomName, new Set())
            this.logger.info(`Кімната '${roomName}' створена (перше приєднання).`)
        }
        this.rooms.get(roomName).add(ws)

        if (!ws.rooms) {
            // Це вже ініціалізується в handleConnection, але для безпеки залишаємо
            ws.rooms = new Set()
        }
        ws.rooms.add(roomName)

        this.logger.info(
            `Користувач ${
                ws.userId
            } приєднався до кімнати: ${roomName}. Поточні кімнати клієнта: ${Array.from(ws.rooms)}`,
        )

        // Логіка запуску періодичного опитування для кімнати:
        const roomConfig = this.predefinedRoomsConfig.find((r) => r.name === roomName)
        const isPredefinedRoom = !!roomConfig

        if (isPredefinedRoom && roomConfig.updates && roomConfig.updates.enabled) {
            // Якщо це predefined кімната з увімкненими оновленнями,
            // то інтервал оновлення вже запущені через initializePredefinedRooms.
            // Запит до БД буде виконано, як тільки з'явиться хоча б один клієнт.
            this.logger.debug(
                `Кімната '${roomName}' вже має запущену циклічну перевірку (predefined).`,
            )
        } else if (
            !isPredefinedRoom &&
            this.rooms.get(roomName).size === 1 &&
            this.shouldRoomHaveUpdates(roomName)
        ) {
            // Якщо це динамічна кімната І це ПЕРШИЙ клієнт у кімнаті,
            // то запускаємо періодичне опитування для цієї кімнати.
            const roomMeta = this.roomMetadata.get(roomName)
            const dynamicDataSourceMethod =
                roomMeta && roomMeta.dataSourceMethod ? roomMeta.dataSourceMethod : 'getRoomData'

            this.startRoomUpdates(
                roomName,
                this.config.websocket.defaultRoomUpdateInterval,
                dynamicDataSourceMethod,
            )
            this.logger.info(
                `Періодичне опитування бази даних налаштовано для динамічної кімнати '${roomName}' (перший клієнт), метод: ${dynamicDataSourceMethod}.`,
            )
        } else {
            this.logger.debug(
                `Кімната '${roomName}' не потребує запуску періодичного опитування при приєднанні клієнта.`,
            )
        }
        ws.send(JSON.stringify({ type: 'joined', roomName: roomName }))
    }

    /**
     * Видаляє WebSocket-клієнта з вказаної кімнати.
     * Якщо кімната стає порожньою, зупиняє її періодичні оновлення.
     * @param {AuthenticatedWebSocket} ws - WebSocket-клієнт, що залишає кімнату.
     * @param {string} roomName - Назва кімнати, яку залишити.
     * @param {boolean} [notify=true] - Чи надсилати повідомлення про вихід з кімнати.
     */
    leaveRoom(ws, roomName, notify = true) {
        const room = this.rooms.get(roomName)
        if (room) {
            room.delete(ws)
            if (ws.rooms) {
                ws.rooms.delete(roomName)
            }
            this.logger.info(`Користувач ${ws.userId} залишив кімнату: ${roomName}.`)

            if (notify) {
                ws.send(JSON.stringify({ type: 'left', roomName: roomName }))
            }

            // Перевіряємо, чи кімната стала порожньою
            if (room.size === 0) {
                const roomConfig = this.predefinedRoomsConfig.find((r) => r.name === roomName)
                if (!roomConfig) {
                    // Якщо це динамічна кімната
                    this.stopRoomUpdates(roomName) // Зупиняємо інтервал, незалежно від типу кімнати
                    this.rooms.delete(roomName) // Видаляємо порожню динамічну кімнату
                    this.roomMetadata.delete(roomName) // Видаляємо метадані для порожньої динамічної кімнати
                    this.logger.info(
                        `Динамічна кімната '${roomName}' стала порожньою та була видалена. Оновлення зупинено.`,
                    )
                } else {
                    // Якщо це predefined кімната
                    this.logger.info(
                        `Попередньо визначена кімната '${roomName}' стала порожньою, її періодичне опитування зупинено.`,
                    )
                }
            }
        } else {
            this.logger.warn(
                `Користувач ${ws.userId} намагався залишити неіснуючу кімнату: ${roomName}.`,
            )
            if (notify) {
                ws.send(
                    JSON.stringify({ type: 'error', message: `Кімнати '${roomName}' не існує.` }),
                )
            }
        }
    }

    /**
     * Надсилає повідомлення всім клієнтам у вказаній кімнаті.
     * @param {string} roomName - Назва кімнати.
     * @param {Object} message - Об'єкт повідомлення, що буде конвертований в JSON.
     */
    sendMessageToRoom(roomName, message) {
        const room = this.rooms.get(roomName)
        if (room) {
            const messageString = JSON.stringify(message)
            room.forEach((clientWs) => {
                if (clientWs.readyState === clientWs.OPEN) {
                    clientWs.send(messageString)
                }
            })
            this.logger.debug(
                `Повідомлення типу '${message.type}' надіслано до кімнати '${roomName}'. Кількість отримувачів: ${room.size}`,
            )
        } else {
            this.logger.warn(`Спроба надіслати повідомлення до неіснуючої кімнати: ${roomName}.`)
        }
    }

    /**
     * Запускає періодичне оновлення даних для вказаної кімнати.
     * Використовує вказаний dataSource з dbService.
     * Фактичні запити до БД виконуються лише тоді, коли в кімнаті є активні клієнти.
     * @param {string} roomName - Назва кімнати для оновлення.
     * @param {number} intervalMs - Інтервал оновлення в мілісекундах.
     * @param {string} dataSourceMethod - Назва методу в dbService для отримання даних.
     */
    startRoomUpdates(roomName, intervalMs, dataSourceMethod = 'getRoomData') {
        if (this.roomUpdateIntervals.has(roomName)) {
            return // Оновлення вже запущені для цієї кімнати
        }

        this.logger.info(
            `Запуск періодичного опитування для кімнати '${roomName}' з інтервалом ${intervalMs}мс (джерело: ${dataSourceMethod}).`,
        )

        const intervalId = setInterval(async () => {
            const roomClients = this.rooms.get(roomName)
            const hasActiveClients = roomClients && roomClients.size > 0

            // Якщо в кімнаті немає клієнтів, зупиняємо оновлення та видаляємо кімнату (якщо вона не predefined)
            if (!hasActiveClients) {
                const roomConfig = this.predefinedRoomsConfig.find((r) => r.name === roomName)

                if (!roomConfig) {
                    // Якщо це динамічна кімната
                    this.stopRoomUpdates(roomName) // Зупиняємо інтервал
                    this.rooms.delete(roomName) // Видаляємо порожню динамічну кімнату
                    this.roomMetadata.delete(roomName) // Видаляємо метадані
                    this.logger.debug(
                        `[${roomName}] Періодичне опитування зупинено (динамічна кімната порожня) та видалена.`,
                    )
                } else {
                    // Якщо це predefined кімната
                    this.logger.debug(
                        `[${roomName}] Періодичне опитування зупинено (попередньо визначена кімната порожня).`,
                    )
                }

                return // Не виконуємо запит до БД
            }

            // Отримуємо параметри для динамічних кімнат (якщо є)
            const roomMeta = this.roomMetadata.get(roomName)
            const dataParameters = roomMeta ? roomMeta.dataParameters : {}

            try {
                const fetchMethod = this.dbService[dataSourceMethod]
                if (typeof fetchMethod !== 'function') {
                    this.logger.error(
                        `[${roomName}] Метод джерела даних '${dataSourceMethod}' не знайдено в dbService. Перевірте config.predefinedRooms та dbService.`,
                    )
                    return
                }

                let rawData
                // Логіка для вибору передачі параметрів у dbService метод
                // Вважаємо, що dbService методи можуть приймати roomName та опціонально params.
                // Або можуть мати специфічні сигнатури, як getOrderByOrderId(orderId).
                if (
                    dataSourceMethod === 'getOrderByOrderId' &&
                    roomName.startsWith('order-status-')
                ) {
                    const orderId = roomName.substring('order-status-'.length)
                    rawData = await fetchMethod(orderId)
                } else if (
                    dataSourceMethod === 'getGameSessionDetails' &&
                    roomName.startsWith('game-session-')
                ) {
                    const sessionId = roomName.substring('game-session-'.length)
                    rawData = await fetchMethod(sessionId)
                } else {
                    // Загальний випадок, передаємо roomName та всі параметри, якщо вони є
                    rawData = await fetchMethod(roomName, dataParameters)
                }

                const customFormattedData = {
                    reportTime: new Date().toISOString(),
                    room: roomName,
                    activeUsersCount: hasActiveClients ? roomClients.size : 0,
                    data: rawData,
                }

                this.sendMessageToRoom(roomName, {
                    type: 'periodicUpdate',
                    data: customFormattedData,
                })
                this.logger.debug(
                    `[${roomName}] Дані оновлено та розіслано (джерело: ${dataSourceMethod}).`,
                )
            } catch (error) {
                this.logger.error(
                    `[${roomName}] Помилка отримання даних з БД (джерело: ${dataSourceMethod}):`,
                    error,
                )
            }
        }, intervalMs)

        this.roomUpdateIntervals.set(roomName, intervalId)
    }

    /**
     * Зупиняє періодичне оновлення даних для вказаної кімнати.
     * @param {string} roomName - Назва кімнати, для якої потрібно зупинити оновлення.
     */
    stopRoomUpdates(roomName) {
        if (this.roomUpdateIntervals.has(roomName)) {
            clearInterval(this.roomUpdateIntervals.get(roomName))
            this.roomUpdateIntervals.delete(roomName)
            this.logger.info(`Періодичне опитування для кімнати '${roomName}' зупинено.`)
        }
    }

    /**
     * Визначає, чи повинна динамічна кімната мати періодичні оновлення за замовчуванням.
     * Наразі всі динамічні кімнати, що створюються клієнтами, будуть мати оновлення.
     * @param {string} roomName - Назва кімнати.
     * @returns {boolean} True, якщо кімната повинна мати оновлення, false в іншому випадку.
     */
    shouldRoomHaveUpdates(roomName) {
        // Тут можна додати більш складну логіку, якщо потрібно обмежувати оновлення для певних динамічних кімнат.
        return false //true
    }

    /**
     * Надсилає повідомлення конкретному користувачу за його userId.
     * @param {string} userId - ID користувача, якому потрібно надіслати повідомлення.
     * @param {Object} message - Об'єкт повідомлення, що буде конвертований в JSON.
     */
    notifyUser(userId, message) {
        const clientWs = this.clients.get(userId)
        if (clientWs && clientWs.readyState === clientWs.OPEN) {
            clientWs.send(JSON.stringify(message))
            this.logger.debug(
                `Повідомлення типу '${message.type}' надіслано користувачу '${userId}'.`,
            )
        } else {
            this.logger.warn(`Користувач '${userId}' не знайдений або його з'єднання неактивне.`)
        }
    }

    /**
     * Надсилає повідомлення всім **активним і автентифікованим** WebSocket-клієнтам,
     * незалежно від кімнат.
     * @param {Object} message - Об'єкт повідомлення, що буде конвертований в JSON.
     * @example
     * // websocketManagerInstance.broadcast({ type: 'systemAlert', text: 'Сервер буде перезавантажено через 5 хвилин!', severity: 'critical' });
     */
    broadcast(message) {
        this.logger.info('Запуск глобальної розсилки всім автентифікованим клієнтам:', message)
        let sentCount = 0
        this.wss.clients.forEach((clientWs) => {
            // Перевіряємо, чи клієнт активний, відкритий та автентифікований
            /** @type {AuthenticatedWebSocket} */
            const currentClient = /** @type {AuthenticatedWebSocket} */ (clientWs)
            if (currentClient.readyState === currentClient.OPEN && currentClient.isAuthenticated) {
                currentClient.send(JSON.stringify(message))
                sentCount++
            }
        })
        this.logger.info(
            `Глобальна розсилка завершена. Розіслано ${sentCount} автентифікованим клієнтам.`,
        )
    }

    /**
     * Запускає інтервал для відправки PING-повідомлень клієнту.
     * Це допомагає підтримувати з'єднання живим і виявляти обірвані з'єднання.
     * @param {AuthenticatedWebSocket} ws - WebSocket-клієнт.
     * @private
     */
    startPingInterval(ws) {
        // Очищаємо попередній інтервал, якщо існує
        if (ws.pingInterval) {
            clearInterval(ws.pingInterval)
        }

        // PING кожні 30 секунд, та закриваємо, якщо PONG не отримано протягом 45 секунд
        const pingInterval = 30 * 1000
        const pongTimeout = 45 * 1000

        ws.pingInterval = setInterval(() => {
            if (ws.readyState === ws.OPEN) {
                if (Date.now() - ws.lastPong > pongTimeout) {
                    this.logger.warn(
                        `[PING/PONG] Клієнт ${ws.userId} не відповів на PONG, закриваю з'єднання.`,
                    )
                    ws.terminate() // Примусово закрити з'єднання
                    clearInterval(ws.pingInterval) // Зупинити інтервал
                    return
                }
                ws.ping() // Відправити PING
                this.logger.debug(`[PING/PONG] Відправлено PING до ${ws.userId}`)
            } else {
                clearInterval(ws.pingInterval) // Зупинити інтервал, якщо з'єднання вже не відкрите
            }
        }, pingInterval)
    }

    /**
     * Повертає об'єкт WebSocketServer.
     * @returns {WebSocketServer}
     */
    getWss() {
        return this.wss
    }
}

export default WebSocketManager
