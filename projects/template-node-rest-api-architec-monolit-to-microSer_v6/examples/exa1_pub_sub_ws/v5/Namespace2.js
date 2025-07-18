// Namespace.js

import Room from './Room.js' // Ваш клас Room
import { createLogger } from './logger.js' // Ваш логер

/**
 * Клас, що представляє логічний простір для WebSocket-з'єднань та кімнат.
 * Керує клієнтами та їх взаємодією в межах цього простору.
 */
class Namespace {
    /**
     * @private
     * Ім'я цього Namespace.
     * @type {string}
     */
    #name

    /**
     * @private
     * Об'єкт логера для цього Namespace.
     * @type {object}
     */
    #logger

    /**
     * Мапа для зберігання всіх активних ConnectedClient об'єктів у цьому Namespace.
     * Key: connectionId (string), Value: ConnectedClient
     * @private
     * @type {Map<string, ConnectedClient>}
     */
    #clients

    /**
     * Мапа для зберігання всіх активних Room об'єктів у цьому Namespace.
     * Key: roomName (string), Value: Room
     * @private
     * @type {Map<string, Room>}
     */
    #rooms

    /**
     * Функція зворотного виклику, що викликається, коли кімната стає порожньою та видаляється.
     * @private
     * @type {function(string, string): void}
     */
    #onRoomRemovedCallback

    /**
     * Функція для обробки подій за замовчуванням, якщо жоден кастомний обробник не знайдено.
     * @private
     * @type {function({type: string, payload: any, client: ConnectedClient, namespace: Namespace}): Promise<void>}
     */
    #defaultEventHandler // Приватне поле для дефолтного обробника

    /**
     * Мапа для зберігання кастомних обробників подій.
     * Key: eventType (string), Value: function({type: string, payload: any, client: ConnectedClient, namespace: Namespace}): Promise<void>
     * @private
     * @type {Map<string, function({type: string, payload: any, client: ConnectedClient, namespace: Namespace}): Promise<void>>}
     */
    #customEventHandlers

    /**
     * @param {string} name - Ім'я Namespace.
     * @param {object} [logger=createLogger(`Namespace:${name}`)] - Об'єкт логера.
     * @param {object} [options={}] - Опції для Namespace.
     * @param {function(string, string): void} [options.onRoomRemoved] - Функція зворотного виклику для видалення кімнати.
     */
    constructor(name, logger = createLogger(`Namespace:${name}`), { onRoomRemoved } = {}) {
        this.#name = name
        this.#logger = logger
        this.#clients = new Map()
        this.#rooms = new Map()
        this.#onRoomRemovedCallback = onRoomRemoved || (() => {}) // Ініціалізуємо колбек

        this.#customEventHandlers = new Map()
        this.#defaultEventHandler = this.#createDefaultEventHandler() // Ініціалізуємо дефолтний обробник
    }

    /**
     * Повертає ім'я Namespace.
     * @returns {string}
     */
    get name() {
        return this.#name
    }

    /**
     * Повертає кількість підключених клієнтів.
     * @returns {number}
     */
    get totalClients() {
        return this.#clients.size
    }

    /**
     * Внутрішній метод для створення та повернення дефолтного обробника подій.
     * Винесено в окремий метод для чистоти та можливості перевизначення.
     * @private
     * @returns {function({type: string, payload: any, client: ConnectedClient, namespace: Namespace}): Promise<void>}
     */
    #createDefaultEventHandler() {
        return async ({ type, payload, client, namespace }) => {
            this.#logger.debug(`[Namespace:${this.#name}] Handling default event type: ${type}`, {
                type,
                payload,
                clientId: client.connectionId,
            })

            switch (type) {
                case 'JOIN_ROOM':
                    if (!payload || typeof payload.roomName !== 'string') {
                        client.send({
                            type: 'ERROR',
                            payload: 'JOIN_ROOM: Missing or invalid roomName.',
                        })
                        this.#logger.warn(
                            `[Namespace:${this.#name}] Client ${
                                client.connectionId
                            } sent invalid JOIN_ROOM payload.`,
                            {
                                payload,
                                clientId: client.connectionId,
                            },
                        )
                        return
                    }
                    try {
                        const roomName = payload.roomName
                        let room = this.#rooms.get(roomName)
                        if (!room) {
                            room = this.#createRoom(roomName) // Створюємо кімнату, якщо її немає
                            this.#logger.info(
                                `[Namespace:${this.#name}] Created new room: '${roomName}'.`,
                                { roomName },
                            )
                        }
                        await room.addClient(client)
                        client.send({
                            type: 'JOINED_ROOM',
                            payload: { roomName: room.name, namespace: this.#name },
                        })
                        // Повідомляємо інших клієнтів у кімнаті
                        room.broadcast(
                            {
                                type: 'USER_JOINED',
                                payload: {
                                    userId: client.userId,
                                    connectionId: client.connectionId,
                                    roomName: room.name,
                                },
                            },
                            [client.connectionId], // Виключаємо самого клієнта
                        )
                        this.#logger.info(
                            `[Namespace:${this.#name}] Client ${client.connectionId} (User:${
                                client.userId
                            }) joined room '${roomName}'.`,
                            {
                                clientId: client.connectionId,
                                userId: client.userId,
                                roomName,
                            },
                        )
                    } catch (error) {
                        this.#logger.error(
                            `[Namespace:${this.#name}] Error joining client ${
                                client.connectionId
                            } to room: ${error.message}`,
                            {
                                clientId: client.connectionId,
                                error: error.message,
                                stack: error.stack,
                            },
                        )
                        client.send({
                            type: 'ERROR',
                            payload: `Failed to join room: ${error.message}`,
                        })
                    }
                    break

                case 'LEAVE_ROOM':
                    if (!payload || typeof payload.roomName !== 'string') {
                        client.send({
                            type: 'ERROR',
                            payload: 'LEAVE_ROOM: Missing or invalid roomName.',
                        })
                        this.#logger.warn(
                            `[Namespace:${this.#name}] Client ${
                                client.connectionId
                            } sent invalid LEAVE_ROOM payload.`,
                            {
                                payload,
                                clientId: client.connectionId,
                            },
                        )
                        return
                    }
                    try {
                        const roomName = payload.roomName
                        const room = this.#rooms.get(roomName)
                        if (room && room.hasClient(client.connectionId)) {
                            room.removeClient(client.connectionId)
                            client.send({
                                type: 'LEFT_ROOM',
                                payload: { roomName: room.name, namespace: this.#name },
                            })
                            // Повідомляємо інших клієнтів у кімнаті
                            room.broadcast(
                                {
                                    type: 'USER_LEFT',
                                    payload: {
                                        userId: client.userId,
                                        connectionId: client.connectionId,
                                        roomName: room.name,
                                    },
                                },
                                [], // Надсилаємо всім, бо клієнт вже видалений з кімнати
                            )
                            this.#logger.info(
                                `[Namespace:${this.#name}] Client ${client.connectionId} (User:${
                                    client.userId
                                }) left room '${roomName}'.`,
                                {
                                    clientId: client.connectionId,
                                    userId: client.userId,
                                    roomName,
                                },
                            )
                        } else {
                            client.send({
                                type: 'ERROR',
                                payload: `LEAVE_ROOM: Not in room '${roomName}' or room does not exist.`,
                            })
                            this.#logger.warn(
                                `[Namespace:${this.#name}] Client ${
                                    client.connectionId
                                } tried to leave non-existent or unjoined room '${roomName}'.`,
                                {
                                    clientId: client.connectionId,
                                    roomName,
                                },
                            )
                        }
                    } catch (error) {
                        this.#logger.error(
                            `[Namespace:${this.#name}] Error leaving client ${
                                client.connectionId
                            } from room: ${error.message}`,
                            {
                                clientId: client.connectionId,
                                error: error.message,
                                stack: error.stack,
                            },
                        )
                        client.send({
                            type: 'ERROR',
                            payload: `Failed to leave room: ${error.message}`,
                        })
                    }
                    break

                case 'CHAT_MESSAGE':
                    if (
                        !payload ||
                        typeof payload.roomName !== 'string' ||
                        typeof payload.message !== 'string'
                    ) {
                        client.send({
                            type: 'ERROR',
                            payload: 'CHAT_MESSAGE: Missing or invalid roomName or message.',
                        })
                        this.#logger.warn(
                            `[Namespace:${this.#name}] Client ${
                                client.connectionId
                            } sent invalid CHAT_MESSAGE payload.`,
                            {
                                payload,
                                clientId: client.connectionId,
                            },
                        )
                        return
                    }
                    try {
                        const roomName = payload.roomName
                        const message = payload.message
                        const room = this.#rooms.get(roomName)
                        if (room && room.hasClient(client.connectionId)) {
                            const chatPayload = {
                                userId: client.userId,
                                message: message,
                                timestamp: Date.now(),
                                roomName: room.name,
                            }
                            room.broadcast({ type: 'NEW_CHAT_MESSAGE', payload: chatPayload })
                            this.#logger.debug(
                                `[Namespace:${this.#name}] Chat message from ${
                                    client.userId
                                } in room '${roomName}': '${message}'.`,
                                {
                                    userId: client.userId,
                                    roomName,
                                    message,
                                },
                            )
                        } else {
                            client.send({
                                type: 'ERROR',
                                payload: `CHAT_MESSAGE: Not in room '${roomName}' or room does not exist.`,
                            })
                            this.#logger.warn(
                                `[Namespace:${this.#name}] Client ${
                                    client.connectionId
                                } tried to send chat message to non-existent or unjoined room '${roomName}'.`,
                                {
                                    clientId: client.connectionId,
                                    roomName,
                                },
                            )
                        }
                    } catch (error) {
                        this.#logger.error(
                            `[Namespace:${this.#name}] Error sending chat message from client ${
                                client.connectionId
                            }: ${error.message}`,
                            {
                                clientId: client.connectionId,
                                error: error.message,
                                stack: error.stack,
                            },
                        )
                        client.send({
                            type: 'ERROR',
                            payload: `Failed to send message: ${error.message}`,
                        })
                    }
                    break

                case 'LIST_ROOMS':
                    const roomsInfo = Array.from(this.#rooms.values()).map((room) => ({
                        name: room.name,
                        clientsCount: room.totalClients,
                    }))
                    client.send({ type: 'ROOMS_LIST', payload: roomsInfo })
                    this.#logger.debug(
                        `[Namespace:${this.#name}] Sent rooms list to client ${
                            client.connectionId
                        }.`,
                        {
                            clientId: client.connectionId,
                            roomsCount: roomsInfo.length,
                        },
                    )
                    break

                case 'WHO_AM_I':
                    client.send({
                        type: 'YOUR_INFO',
                        payload: {
                            connectionId: client.connectionId,
                            userId: client.userId,
                            namespace: this.#name,
                            rooms: Array.from(client.rooms).map(
                                (roomFullName) => roomFullName.split('/')[1],
                            ), // Тільки назви кімнат у поточному Namespace
                        },
                    })
                    this.#logger.debug(
                        `[Namespace:${this.#name}] Sent client info to client ${
                            client.connectionId
                        }.`,
                        {
                            clientId: client.connectionId,
                            userId: client.userId,
                        },
                    )
                    break

                case 'PING':
                    // Клієнт надіслав свій власний PING як JSON повідомлення
                    client.send({ type: 'PONG', payload: payload }) // Відповідаємо PONG з тим самим пейлоадом
                    this.#logger.debug(
                        `[Namespace:${this.#name}] Responded to client-initiated PING from ${
                            client.connectionId
                        }.`,
                        { clientId: client.connectionId, payload },
                    )
                    break

                default:
                    this.#logger.warn(
                        `[Namespace:${this.#name}] Unhandled event type: ${type} from client ${
                            client.connectionId
                        }.`,
                        {
                            type,
                            payload,
                            clientId: client.connectionId,
                        },
                    )
                    client.send({ type: 'ERROR', payload: `Unknown event type: ${type}.` })
                    break
            }
        }
    }

    /**
     * Внутрішній метод для створення нової кімнати.
     * @private
     * @param {string} name - Ім'я кімнати.
     * @returns {Room}
     */
    #createRoom(name) {
        if (this.#rooms.has(name)) {
            this.#logger.warn(
                `[Namespace:${this.#name}] Room '${name}' already exists. Skipping creation.`,
                { roomName: name },
            )
            return this.#rooms.get(name)
        }
        this.#logger.info(`[Namespace:${this.#name}] Creating room: '${name}'.`, { roomName: name })
        const newRoom = new Room(name, this.#name, this.#logger, {
            onEmpty: (roomName, namespaceName) => {
                this.#logger.info(
                    `[Namespace:${this.#name}] Room '${roomName}' is empty. Initiating removal.`,
                    { roomName, namespaceName },
                )
                this.#rooms.delete(roomName)
                this.#onRoomRemovedCallback(roomName, namespaceName) // Викликаємо колбек додатка
            },
        })
        this.#rooms.set(name, newRoom)
        return newRoom
    }

    /**
     * Додає клієнта до цього Namespace.
     * @param {ConnectedClient} client - Об'єкт клієнта.
     */
    addClient(client) {
        if (this.#clients.has(client.connectionId)) {
            this.#logger.warn(
                `[Namespace:${this.#name}] Client ${
                    client.connectionId
                } already in this namespace.`,
                { clientId: client.connectionId },
            )
            return
        }
        this.#clients.set(client.connectionId, client)
        this.#logger.info(
            `[Namespace:${this.#name}] Client ${client.connectionId} (User:${
                client.userId
            }) added. Total clients: ${this.totalClients}.`,
            {
                clientId: client.connectionId,
                userId: client.userId,
                totalClients: this.totalClients,
            },
        )
    }

    /**
     * Видаляє клієнта з цього Namespace та всіх кімнат у ньому.
     * @param {string} connectionId - ID клієнта.
     */
    removeClient(connectionId) {
        const client = this.#clients.get(connectionId)
        if (client) {
            this.#logger.info(
                `[Namespace:${this.#name}] Removing client ${connectionId} (User:${
                    client.userId
                }).`,
                { clientId: connectionId, userId: client.userId },
            )
            // Видаляємо клієнта з усіх кімнат, до яких він приєднаний у цьому Namespace
            // Важливо: client.rooms зберігає "namespace/roomName". Фільтруємо ті, що належать цьому Namespace.
            Array.from(client.rooms)
                .filter((roomFullName) => roomFullName.startsWith(`${this.#name}/`))
                .forEach((roomFullName) => {
                    const roomName = roomFullName.split('/')[1]
                    const room = this.#rooms.get(roomName)
                    if (room) {
                        this.#logger.debug(
                            `[Namespace:${
                                this.#name
                            }] Removing client ${connectionId} from room '${roomName}' during disconnect.`,
                            { clientId: connectionId, roomName },
                        )
                        room.removeClient(connectionId) // Room сам викличе onEmpty, якщо потрібно
                    }
                })

            this.#clients.delete(connectionId)
            this.#logger.info(
                `[Namespace:${this.#name}] Client ${connectionId} removed. Total clients: ${
                    this.totalClients
                }.`,
                { clientId: connectionId, totalClients: this.totalClients },
            )
        } else {
            this.#logger.warn(
                `[Namespace:${
                    this.#name
                }] Attempted to remove non-existent client ${connectionId}.`,
                { clientId: connectionId },
            )
        }
    }

    /**
     * Перевіряє, чи містить Namespace клієнта.
     * @param {string} connectionId - ID клієнта.
     * @returns {boolean}
     */
    hasClient(connectionId) {
        return this.#clients.has(connectionId)
    }

    /**
     * Отримує кімнату за іменем.
     * @param {string} name - Ім'я кімнати.
     * @returns {Room | undefined}
     */
    getRoom(name) {
        return this.#rooms.get(name)
    }

    /**
     * Реєструє кастомний обробник події.
     * @param {string} eventType - Тип події (наприклад, 'CUSTOM_ACTION').
     * @param {function({type: string, payload: any, client: ConnectedClient, namespace: Namespace}): Promise<void>} handler - Функція-обробник.
     */
    on(eventType, handler) {
        if (this.#customEventHandlers.has(eventType)) {
            this.#logger.warn(
                `[Namespace:${
                    this.#name
                }] Overwriting existing handler for event type: ${eventType}.`,
                { eventType },
            )
        }
        this.#customEventHandlers.set(eventType, handler)
        this.#logger.debug(
            `[Namespace:${this.#name}] Registered custom handler for event type: ${eventType}.`,
            { eventType },
        )
    }

    /**
     * Обробляє вхідну подію. Спочатку намагається знайти кастомний обробник, потім використовує дефолтний.
     * @param {{type: string, payload: any, client: ConnectedClient, namespace: Namespace}} event - Об'єкт події.
     */
    async handleEvent(event) {
        const { type, client } = event
        this.#logger.debug(
            `[Namespace:${this.#name}] Attempting to handle event '${type}' for client ${
                client.connectionId
            }.`,
            {
                eventType: type,
                clientId: client.connectionId,
            },
        )

        if (!client.isAuthenticated) {
            this.#logger.warn(
                `[Namespace:${this.#name}] Unauthenticated client ${
                    client.connectionId
                } tried to send event ${type}. Rejecting.`,
                {
                    clientId: client.connectionId,
                    eventType: type,
                },
            )
            client.send({ type: 'ERROR', payload: 'Authentication required to send messages.' })
            return
        }

        const customHandler = this.#customEventHandlers.get(type)
        if (customHandler) {
            try {
                await customHandler(event)
                this.#logger.debug(
                    `[Namespace:${
                        this.#name
                    }] Custom handler processed event '${type}' for client ${client.connectionId}.`,
                    {
                        eventType: type,
                        clientId: client.connectionId,
                    },
                )
            } catch (error) {
                this.#logger.error(
                    `[Namespace:${
                        this.#name
                    }] Error in custom handler for event '${type}' from client ${
                        client.connectionId
                    }: ${error.message}`,
                    {
                        eventType: type,
                        clientId: client.connectionId,
                        error: error.message,
                        stack: error.stack,
                    },
                )
                client.send({
                    type: 'ERROR',
                    payload: `Error processing ${type}: ${error.message}`,
                })
            }
        } else {
            try {
                await this.#defaultEventHandler(event)
                this.#logger.debug(
                    `[Namespace:${
                        this.#name
                    }] Default handler processed event '${type}' for client ${
                        client.connectionId
                    }.`,
                    {
                        eventType: type,
                        clientId: client.connectionId,
                    },
                )
            } catch (error) {
                this.#logger.error(
                    `[Namespace:${
                        this.#name
                    }] Error in default handler for event '${type}' from client ${
                        client.connectionId
                    }: ${error.message}`,
                    {
                        eventType: type,
                        clientId: client.connectionId,
                        error: error.message,
                        stack: error.stack,
                    },
                )
                client.send({
                    type: 'ERROR',
                    payload: `Error processing ${type}: ${error.message}`,
                })
            }
        }
    }

    /**
     * Зупиняє та очищає всі кімнати в цьому Namespace.
     */
    destroy() {
        this.#logger.info(
            `[Namespace:${
                this.#name
            }] Destroying namespace. Disconnecting all clients and clearing rooms.`,
            { namespaceName: this.#name },
        )
        // Клієнти повинні бути відключені на рівні Application або зовнішньо.
        // Тут ми просто очищаємо внутрішні посилання.
        this.#clients.clear()

        for (const room of this.#rooms.values()) {
            room.destroy() // Викликаємо destroy для кожної кімнати
        }
        this.#rooms.clear()
        this.#customEventHandlers.clear()
        this.#logger.info(`[Namespace:${this.#name}] Namespace destroyed.`, {
            namespaceName: this.#name,
        })
    }
}

export default Namespace
