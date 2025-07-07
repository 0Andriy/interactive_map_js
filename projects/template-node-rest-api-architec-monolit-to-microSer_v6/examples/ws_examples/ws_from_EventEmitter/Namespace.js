// src/Namespace.js

import { EventEmitter } from 'events'
import Room from './Room.js'
import Client from './Client.js'
import { logger } from './utils/logger.js'

/**
 * @callback AuthStrategy
 * @param {string | undefined} token - Токен, отриманий з URL.
 * @param {import('ws').WebSocket} ws - Об'єкт WebSocket.
 * @param {import('http').IncomingMessage} request - Об'єкт HTTP-запиту.
 * @returns {object | null | Promise<object | null>} - Об'єкт користувача, якщо автентифікація успішна, інакше null.
 */

/**
 * @typedef {object} NamespaceOptions
 * @property {boolean} [authRequired=false] - Чи потрібна автентифікація для цього простору імен.
 * @property {AuthStrategy} [authStrategy] - Функція для автентифікації клієнта. Якщо не вказано, використовується стратегія за замовчуванням.
 */

/**
 * @callback ConnectionMiddleware
 * @param {Client} client - Об'єкт підключеного клієнта.
 * @param {Function} next - Функція для передачі управління наступному middleware або обробнику.
 * @returns {void | Promise<void>}
 */

/**
 * @callback MessageMiddleware
 * @param {Client} client - Об'єкт клієнта, від якого прийшло повідомлення.
 * @param {object} message - Розпарсоване JSON повідомлення.
 * @param {Function} next - Функція для передачі управління наступному middleware або обробнику.
 * @returns {void | Promise<void>}
 */

class Namespace extends EventEmitter {
    /**
     * @private
     * @type {NamespaceOptions}
     */
    #options

    /**
     * @private
     * @type {ConnectionMiddleware[]}
     */
    #connectionMiddleware = [] // Стек middleware для подій підключення

    /**
     * @private
     * @type {MessageMiddleware[]}
     */
    #messageMiddleware = [] // Стек middleware для вхідних повідомлень

    /**
     * @param {string} path - Шлях простору імен (наприклад, '/chat').
     * @param {NamespaceOptions} [options={}] - Опції для простору імен.
     */
    constructor(path, options = {}) {
        super()
        this.path = path
        this.clients = new Map() // Map<clientId, Client object>
        this.rooms = new Map() // Map<roomId, Room object>
        this.logger = logger
        this.#options = {
            authRequired: false,
            ...options,
        }
        this.logger.info(
            `Namespace '${this.path}' created with options: ${JSON.stringify(this.#options)}`,
        )
    }

    /**
     * Повертає опції автентифікації для цього простору імен.
     * @returns {NamespaceOptions}
     */
    getAuthOptions() {
        return this.#options
    }

    /**
     * Реєструє функцію middleware для подій підключення.
     * Ці middleware виконуються ПЕРЕД подією 'connection'.
     * @param {ConnectionMiddleware} middleware - Функція middleware.
     * @returns {Namespace} - Повертає поточний екземпляр Namespace для ланцюгових викликів.
     */
    useConnection(middleware) {
        this.#connectionMiddleware.push(middleware)
        this.logger.debug(`[Namespace ${this.path}] Додано Connection Middleware.`)
        return this
    }

    /**
     * Реєструє функцію middleware для вхідних повідомлень.
     * Ці middleware виконуються ПЕРЕД тим, як повідомлення буде оброблено внутрішньо або емітовано.
     * @param {MessageMiddleware} middleware - Функція middleware.
     * @returns {Namespace} - Повертає поточний екземпляр Namespace для ланцюгових викликів.
     */
    useMessage(middleware) {
        this.#messageMiddleware.push(middleware)
        this.logger.debug(`[Namespace ${this.path}] Додано Message Middleware.`)
        return this
    }

    /**
     * Запускає ланцюжок middleware для нового підключення.
     * @param {Client} client - Об'єкт підключеного клієнта.
     * @param {Function} callback - Функція, яка буде викликана після завершення всіх middleware.
     * @private
     */
    async #runConnectionMiddleware(client, callback) {
        const middlewares = this.#connectionMiddleware
        let index = 0

        const next = async (err) => {
            if (err) {
                this.logger.error(
                    `[Namespace ${this.path}] Connection Middleware error for client ${client.id}:`,
                    err,
                )
                // Якщо є помилка, закриваємо з'єднання
                client.ws.close(1011, `Middleware Error: ${err.message || 'Internal error'}`)
                return
            }

            if (index < middlewares.length) {
                const middleware = middlewares[index++]
                try {
                    await middleware(client, next)
                } catch (error) {
                    this.logger.error(
                        `[Namespace ${this.path}] Uncaught error in Connection Middleware ${
                            index - 1
                        } for client ${client.id}:`,
                        error,
                    )
                    client.ws.close(1011, `Middleware Error: ${error.message || 'Internal error'}`)
                }
            } else {
                callback() // Всі middleware пройдені успішно
            }
        }
        await next()
    }

    /**
     * Запускає ланцюжок middleware для вхідного повідомлення.
     * @param {Client} client - Об'єкт клієнта.
     * @param {object} message - Повідомлення від клієнта.
     * @param {Function} callback - Функція, яка буде викликана після завершення всіх middleware.
     * @private
     */
    async #runMessageMiddleware(client, message, callback) {
        const middlewares = this.#messageMiddleware
        let index = 0

        const next = async (err) => {
            if (err) {
                this.logger.error(
                    `[Namespace ${this.path}] Message Middleware error for client ${
                        client.id
                    } (message: ${JSON.stringify(message)}):`,
                    err,
                )
                // Можна надіслати помилку клієнту або просто ігнорувати повідомлення
                client.send('error', {
                    event: message.event,
                    message: `Message processing failed: ${err.message || 'Internal error'}`,
                })
                return
            }

            if (index < middlewares.length) {
                const middleware = middlewares[index++]
                try {
                    await middleware(client, message, next)
                } catch (error) {
                    this.logger.error(
                        `[Namespace ${this.path}] Uncaught error in Message Middleware ${
                            index - 1
                        } for client ${client.id} (message: ${JSON.stringify(message)}):`,
                        error,
                    )
                    client.send('error', {
                        event: message.event,
                        message: `Message processing failed: ${error.message || 'Internal error'}`,
                    })
                }
            } else {
                callback() // Всі middleware пройдені успішно
            }
        }
        await next()
    }

    /**
     * Додає нового клієнта до цього простору імен.
     * @param {Client} client - Об'єкт клієнта.
     */
    addClient(client) {
        if (this.clients.has(client.id)) return

        this.clients.set(client.id, client)
        client.namespace = this // Клієнт знає свій простір імен
        this.logger.info(
            `[Namespace ${this.path}] Client ${client.id} (User: ${
                client.user ? client.user.userId : 'Guest'
            }) connected.`,
        )

        // Слухаємо базові події від клієнта
        client.on('message', (message) =>
            this.#runMessageMiddleware(client, message, () =>
                this._handleClientMessage(client, message),
            ),
        )
        client.on('disconnect', (code, reason) =>
            this._handleClientDisconnect(client, code, reason),
        )
        client.on('error', (error) => this._handleClientError(client, error))

        // Запускаємо Connection Middleware перед емітуванням події 'connection'
        this.#runConnectionMiddleware(client, () => {
            // Емітуємо подію 'connection' тільки якщо це НЕ кореневий простір імен,
            // оскільки для кореневого простору цю подію емітує WSServer.
            if (this.path !== '/') {
                this.emit('connection', client)
            }
        })
    }

    /**
     * Видаляє клієнта з цього простору імен.
     * @param {Client} client - Об'єкт клієнта.
     */
    removeClient(client) {
        if (this.clients.delete(client.id)) {
            // Видаляємо клієнта з усіх кімнат, до яких він належав
            client.rooms.forEach((roomId) => {
                const room = this.rooms.get(roomId)
                if (room) {
                    room.removeClient(client) // Кімната сама вирішує, чи знищити себе
                }
            })
            this.logger.info(
                `[Namespace ${this.path}] Client ${client.id} (User: ${
                    client.user ? client.user.userId : 'Guest'
                }) disconnected.`,
            )
        }
    }

    /**
     * Отримує кімнату за її ID. Створює, якщо не існує, з опціями.
     * @param {string} roomId - ID кімнати.
     * @param {import('./Room.js').RoomOptions} [options={}] - Опції для кімнати.
     * @returns {Room}
     */
    room(roomId, options = {}) {
        if (!this.rooms.has(roomId)) {
            // Передаємо "this" (Namespace) як manager для кімнати, щоб вона могла взаємодіяти з клієнтами
            const newRoom = new Room(roomId, options, this)
            this.rooms.set(roomId, newRoom)
        }
        // Важливо: якщо кімната вже існує, options не будуть застосовані повторно.
        return this.rooms.get(roomId)
    }

    /**
     * Викликається кімнатою, коли вона стає порожньою, для її видалення зі сховища.
     * @param {string} roomName - Назва кімнати, яку потрібно перевірити та видалити.
     */
    checkAndRemoveEmptyRoom(roomName) {
        const room = this.rooms.get(roomName)
        if (room && room.getClientCount() === 0) {
            this.rooms.delete(roomName)
            this.logger.info(
                `[Namespace ${this.path}] Кімнату '${roomName}' видалено зі сховища Namespace.`,
            )
        }
    }

    /**
     * Отримує об'єкт Client за його ID. Використовується класом Room для broadcast.
     * @param {string} clientId - ID клієнта.
     * @returns {Client | undefined} - Об'єкт клієнта, або undefined, якщо не знайдено.
     */
    getClientById(clientId) {
        return this.clients.get(clientId)
    }

    /**
     * Обробляє вхідні повідомлення від клієнта після проходження middleware.
     * @param {Client} client - Об'єкт клієнта.
     * @param {object} message - Розпарсоване JSON повідомлення.
     * @private
     */
    _handleClientMessage(client, message) {
        const { event, data } = message
        if (event) {
            // Емітуємо подію на рівні простору імен, щоб її могли слухати зовнішні обробники
            this.emit(event, client, data)

            // Обробка спеціальних подій для кімнат
            if (event === 'joinRoom' && typeof data === 'string') {
                const room = this.room(data) // Можливо, з опціями, якщо кімната створюється вперше
                room.addClient(client)
                client.send('joinedRoom', data)
                room.broadcast(
                    'userJoined',
                    {
                        userId: client.user ? client.user.userId : 'Guest',
                        clientId: client.id,
                        roomId: data,
                    },
                    client,
                )
                this.logger.info(
                    `Client ${client.id} (User: ${
                        client.user ? client.user.userId : 'Guest'
                    }) joined room ${data} in namespace ${this.path}`,
                )
            } else if (event === 'leaveRoom' && typeof data === 'string') {
                const room = this.rooms.get(data)
                if (room) {
                    room.removeClient(client)
                    client.send('leftRoom', data)
                    // Важливо: перевіряємо, чи кімната ще існує, перш ніж робити broadcast, оскільки removeClient може її знищити
                    if (this.rooms.has(data)) {
                        room.broadcast(
                            'userLeft',
                            {
                                userId: client.user ? client.user.userId : 'Guest',
                                clientId: client.id,
                                roomId: data,
                            },
                            client,
                        )
                    }
                    this.logger.info(
                        `Client ${client.id} (User: ${
                            client.user ? client.user.userId : 'Guest'
                        }) left room ${data} in namespace ${this.path}`,
                    )
                }
            } else if (
                event === 'messageToRoom' &&
                typeof data === 'object' &&
                data.roomId &&
                data.message
            ) {
                const room = this.rooms.get(data.roomId)
                if (room && client.isInRoom(data.roomId)) {
                    room.broadcast(
                        'chatMessage',
                        {
                            senderId: client.id,
                            userId: client.user ? client.user.userId : 'Guest',
                            message: data.message,
                            roomId: data.roomId,
                        },
                        client,
                    )
                } else {
                    client.send('error', { message: 'Room not found or you are not in this room.' })
                }
            }
        } else {
            this.logger.warn(
                `[Namespace ${this.path}] Client ${client.id} (User: ${
                    client.user ? client.user.userId : 'Guest'
                }) sent message without 'event' property:`,
                message,
            )
        }
    }

    _handleClientDisconnect(client, code, reason) {
        this.removeClient(client)
        this.emit('disconnect', client, code, reason) // Емітуємо для зовнішніх обробників
    }

    _handleClientError(client, error) {
        this.emit('clientError', client, error) // Емітуємо для зовнішніх обробників
    }

    /**
     * Відправляє повідомлення всім клієнтам у цьому просторі імен.
     * @param {string} eventName - Назва події.
     * @param {object} payload - Об'єкт даних.
     */
    broadcast(eventName, payload) {
        this.clients.forEach((client) => client.send(eventName, payload))
    }
}

export default Namespace
