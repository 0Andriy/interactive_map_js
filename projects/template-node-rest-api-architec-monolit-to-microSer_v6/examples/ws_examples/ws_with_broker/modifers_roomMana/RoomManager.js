// src/websockets/RoomManager.js

import { WebSocket } from 'ws' // Імпортуємо WebSocket для типізації
import Redis from 'ioredis' // Імпортуємо Redis

/**
 * @typedef {object} RoomConfig
 * @property {Set<WebSocket>} clients - Множина підключених WebSocket клієнтів.
 * @property {NodeJS.Timeout | null} intervalId - ID інтервалу для періодичних оновлень, якщо він активний.
 * @property {Function | null} updateCallback - Функція, яка викликається для отримання даних для оновлення.
 * @property {number} updateIntervalMs - Інтервал у мілісекундах для оновлень.
 * @property {boolean} runInitialUpdate - Чи запускати callback при першому старті інтервалу.
 */

/**
 * @typedef {object} Logger
 * @property {(message?: any, ...optionalParams: any[]) => void} info - Метод для інформаційних повідомлень.
 * @property {(message?: any, ...optionalParams: any[]) => void} debug - Метод для налагоджувальних повідомлень.
 * @property {(message?: any, ...optionalParams: any[]) => void} warn - Метод для попереджувальних повідомлень.
 * @property {(message?: any, ...optionalParams: any[]) => void} error - Метод для повідомлень про помилки.
 */

/**
 * @interface CustomWebSocket
 * @extends WebSocket
 * @property {string} [id] - Унікальний ідентифікатор клієнта.
 * @property {string} [userId] - Унікальний ідентифікатор користувача (з БД).
 * @property {string} [username] - Ім'я користувача, асоційоване з клієнтом.
 * @property {boolean} [__closeHandlerRegistered] - Внутрішній прапорець для відстеження реєстрації обробника 'close'.
 * @property {Set<string>} [myRooms] - Локальне відстеження кімнат, до яких належить цей клієнт.
 * @method {function(event: string, listener: Function): void} on - Додає слухача події.
 * @method {function(data: string | ArrayBufferLike | Blob | Buffer): void} send - Надсилає дані через WebSocket.
 */

class RoomManager {
    /**
     * Створює новий менеджер кімнат.
     * @param {object} options - Опції для RoomManager.
     * @param {Logger} [options.logger=console] - Об'єкт логера.
     * @param {object} [options.redisConfig={host: '127.0.0.1', port: 6379}] - Конфігурація Redis.
     */
    constructor(options = {}) {
        const { logger = console, redisConfig = { host: '127.0.0.1', port: 6379 } } = options

        /** @private @type {Map<string, RoomConfig>} */
        this.rooms = new Map()

        /** @private @type {Map<CustomWebSocket, Set<string>>} */
        this.clientRoomMap = new Map() // Зберігає локальне відстеження кімнат для клієнтів цього інстансу

        /** @private @type {Logger} */
        this.logger = logger

        /** @private @type {Redis.Redis} */
        this.publisher = new Redis(redisConfig)
        /** @private @type {Redis.Redis} */
        this.subscriber = new Redis(redisConfig)

        this.#setupRedisListeners()
    }

    /**
     * @private
     * Налаштовує слухачів для Redis Pub/Sub.
     */
    #setupRedisListeners() {
        this.subscriber.on('error', (err) => this.logger.error('Redis Subscriber Error:', err))
        this.publisher.on('error', (err) => this.logger.error('Redis Publisher Error:', err))

        // Підписуємося на глобальний канал розсилок за замовчуванням
        this.subscriber.subscribe('global_broadcast_channel', (err, count) => {
            if (err) {
                this.logger.error('Failed to subscribe to global_broadcast_channel:', err)
            } else {
                this.logger.info(`Subscribed to global_broadcast_channel. Total channels: ${count}`)
            }
        })

        this.subscriber.on('message', (channel, message) => {
            try {
                const parsedMessage = JSON.parse(message)
                this.logger.debug(`Received Redis message from channel ${channel}:`, parsedMessage)

                // Обробка глобальних розсилок
                if (channel === 'global_broadcast_channel') {
                    // Розсилаємо всім клієнтам, які підключені до цього інстансу
                    this.clientRoomMap.forEach((rooms, clientWebSocket) => {
                        if (clientWebSocket.readyState === WebSocket.OPEN) {
                            try {
                                clientWebSocket.send(message) // Відправляємо як є, вже JSON.stringified
                            } catch (sendError) {
                                this.logger.error(
                                    `Error sending global message to client ${
                                        clientWebSocket.id || clientWebSocket.username
                                    }:`,
                                    sendError,
                                )
                                this.#removeClientGlobally(clientWebSocket)
                            }
                        }
                    })
                }
                // Обробка повідомлень для конкретних кімнат (через Redis)
                else if (channel.startsWith('room:')) {
                    const roomName = channel.substring(5) // Видаляємо префікс 'room:'
                    const room = this.rooms.get(roomName)

                    if (room && room.clients.size > 0) {
                        // Розсилаємо повідомлення лише клієнтам цієї кімнати на цьому інстансі
                        room.clients.forEach((clientWebSocket) => {
                            if (clientWebSocket.readyState === WebSocket.OPEN) {
                                try {
                                    clientWebSocket.send(message) // Відправляємо як є
                                } catch (sendError) {
                                    this.logger.error(
                                        `Error sending room message to client ${
                                            clientWebSocket.id || clientWebSocket.username
                                        } in room ${roomName}:`,
                                        sendError,
                                    )
                                    this.#removeClientGlobally(clientWebSocket)
                                }
                            }
                        })
                    } else {
                        // Якщо кімната порожня на цьому інстансі, або не існує, можна відписатися від каналу
                        // Це вже робиться в leaveRoom / #removeClientGlobally
                        this.logger.debug(
                            `Received message for room '${roomName}', but no active clients on this instance. Possibly outdated subscription.`,
                        )
                    }
                }
                // Додайте інші канали за потребою
            } catch (error) {
                this.logger.error('Error parsing Redis message or in message handler:', error)
            }
        })
    }

    /**
     * Публікує повідомлення в Redis канал.
     * Цей метод буде використовуватися внутрішньо для розсилки повідомлень між інстансами.
     * @private
     * @param {string} channel - Назва Redis каналу.
     * @param {string | object | Buffer | ArrayBuffer} message - Повідомлення для публікації.
     */
    async #publishToRedis(channel, message) {
        let payloadToSend
        if (
            typeof message === 'object' &&
            message !== null &&
            !Buffer.isBuffer(message) &&
            !(message instanceof ArrayBuffer)
        ) {
            payloadToSend = JSON.stringify(message)
        } else {
            payloadToSend = message
        }
        await this.publisher.publish(channel, payloadToSend)
        this.logger.debug(`Published to Redis channel '${channel}'.`)
    }

    /**
     * Створює нову кімнату, якщо її ще немає.
     * @param {string} roomName - Унікальна назва кімнати.
     * @param {function(string, Set<CustomWebSocket>): Promise<string | object | Buffer | ArrayBuffer>} [updateCallback=() => {}] - Асинхронна функція.
     * @param {number} [updateIntervalMs=0] - Інтервал (в мс) для періодичних оновлень.
     * @param {boolean} [runInitialUpdate=false] - Чи запускати `updateCallback` негайно.
     * @returns {RoomConfig | null} Об'єкт конфігурації новоствореної кімнати або `null`, якщо кімната вже існує.
     */
    createRoom(
        roomName,
        updateCallback = async () => null,
        updateIntervalMs = 0,
        runInitialUpdate = false,
    ) {
        if (this.rooms.has(roomName)) {
            this.logger.debug(`Кімната '${roomName}' вже існує.`)
            return null
        }

        const newRoom = {
            clients: new Set(),
            intervalId: null,
            updateCallback: updateCallback,
            updateIntervalMs: updateIntervalMs,
            runInitialUpdate: runInitialUpdate,
        }

        this.rooms.set(roomName, newRoom)
        this.logger.info(`Кімнату '${roomName}' створено.`)
        return newRoom
    }

    /**
     * Додає клієнта до вказаної кімнати.
     * Клієнт також підписує локальний Redis-subscriber на канал кімнати, якщо це перший клієнт на цьому інстансі.
     * @param {string} roomName - Назва кімнати.
     * @param {CustomWebSocket} clientWebSocket - Об'єкт WebSocket клієнта.
     * @param {function(string, Set<CustomWebSocket>): Promise<string | object | Buffer | ArrayBuffer>} [updateCallback] - Асинхронна функція.
     * @param {number} [updateIntervalMs] - Інтервал оновлення (в мс).
     * @param {boolean} [runInitialUpdate] - Чи запускати callback негайно.
     * @returns {boolean} - True, якщо клієнта додано, false, якщо кімната або клієнт не знайдено або клієнт вже в кімнаті.
     */
    async joinRoom(roomName, clientWebSocket, updateCallback, updateIntervalMs, runInitialUpdate) {
        let room = this.rooms.get(roomName)

        if (!room) {
            this.createRoom(roomName, updateCallback, updateIntervalMs, runInitialUpdate)
            room = this.rooms.get(roomName)
            if (!room) {
                this.logger.error(`Не вдалося отримати або створити кімнату '${roomName}'.`)
                return false
            }
        }

        const clientIdentifier = clientWebSocket.username || clientWebSocket.id || 'unknown'

        if (room.clients.has(clientWebSocket)) {
            this.logger.debug(`Клієнт ${clientIdentifier} вже знаходиться в кімнаті '${roomName}'.`)
            return false
        }

        // Локально додаємо клієнта до кімнати
        room.clients.add(clientWebSocket)

        // ОНОВЛЮЄМО clientRoomMap:
        if (!this.clientRoomMap.has(clientWebSocket)) {
            this.clientRoomMap.set(clientWebSocket, new Set())
        }
        this.clientRoomMap.get(clientWebSocket).add(roomName)

        // Додаємо кімнату до myRooms клієнта (для зручності очищення при відключенні)
        if (!clientWebSocket.myRooms) clientWebSocket.myRooms = new Set()
        clientWebSocket.myRooms.add(roomName)

        this.logger.debug(
            `Клієнт ${clientIdentifier} приєднався до кімнати '${roomName}'. Всього клієнтів: ${room.clients.size}`,
        )

        // Якщо це перший клієнт на цьому інстансі для цієї кімнати, підписуємось на Redis-канал кімнати
        if (room.clients.size === 1) {
            await this.subscriber.subscribe(`room:${roomName}`, (err) => {
                if (err) this.logger.error(`Error subscribing to Redis room:${roomName}:`, err)
                else this.logger.info(`Subscribed to Redis channel room:${roomName}.`)
            })
            // Запускаємо оновлення, якщо це перший клієнт у кімнаті та налаштований інтервал
            if (room.updateIntervalMs > 0) {
                this.#startRoomDataUpdates(
                    roomName,
                    room.updateCallback,
                    room.updateIntervalMs,
                    room.runInitialUpdate,
                )
            }
        }

        // Додаємо обробник 'close' лише один раз
        if (!clientWebSocket.__closeHandlerRegistered) {
            clientWebSocket.__closeHandlerRegistered = true
            clientWebSocket.on('close', () => {
                this.#removeClientGlobally(clientWebSocket)
            })
            this.logger.debug(`Обробник 'close' для клієнта ${clientIdentifier} зареєстровано.`)
        }

        return true
    }

    /**
     * Видаляє клієнта з кімнати.
     * Якщо кімната стає порожньою, її інтервал оновлення зупиняється і кімната видаляється.
     * Якщо це останній клієнт у кімнаті на цьому інстансі, відписується від Redis-каналу кімнати.
     * @param {string} roomName - Назва кімнати.
     * @param {CustomWebSocket} clientWebSocket - Об'єкт WebSocket клієнта для видалення.
     * @returns {boolean} - True, якщо клієнта видалено, false, якщо кімната або клієнт не знайдено.
     */
    async leaveRoom(roomName, clientWebSocket) {
        const room = this.rooms.get(roomName)
        if (!room) {
            this.logger.warn(
                `Кімната '${roomName}' не знайдена при спробі видалення клієнта ${
                    clientWebSocket.id || clientWebSocket.username
                }.`,
            )
            return false
        }

        const clientIdentifier = clientWebSocket.username || clientWebSocket.id || 'unknown'

        if (room.clients.delete(clientWebSocket)) {
            this.logger.debug(
                `Клієнт ${clientIdentifier} покинув кімнату '${roomName}'. Залишилось клієнтів: ${room.clients.size}`,
            )

            // ОНОВЛЮЄМО clientRoomMap:
            const clientRooms = this.clientRoomMap.get(clientWebSocket)
            if (clientRooms) {
                clientRooms.delete(roomName)
                if (clientRooms.size === 0) {
                    this.clientRoomMap.delete(clientWebSocket)
                    this.logger.debug(
                        `Клієнт ${clientIdentifier} повністю видалено з clientRoomMap.`,
                    )
                }
            }
            if (clientWebSocket.myRooms) {
                // Також очищаємо з myRooms на об'єкті WS
                clientWebSocket.myRooms.delete(roomName)
            }

            if (room.clients.size === 0) {
                this.#stopRoomDataUpdates(roomName) // Зупиняємо інтервал
                this.rooms.delete(roomName) // Видаляємо порожню кімнату
                this.logger.info(`Кімнату '${roomName}' видалено, оскільки вона порожня.`)
                // Якщо кімната порожня на цьому інстансі, відписуємось від Redis-каналу
                await this.subscriber.unsubscribe(`room:${roomName}`, (err) => {
                    if (err)
                        this.logger.error(`Error unsubscribing from Redis room:${roomName}:`, err)
                    else this.logger.info(`Unsubscribed from Redis channel room:${roomName}.`)
                })
            }
            return true
        }

        this.logger.debug(`Клієнт ${clientIdentifier} не був знайдений у кімнаті '${roomName}'.`)
        return false
    }

    /**
     * Надсилає повідомлення всім активним клієнтам у вказаній кімнаті через Redis Pub/Sub.
     * @param {string} roomName - Назва кімнати.
     * @param {string | object | Buffer | ArrayBuffer} message - Повідомлення для надсилання.
     * @returns {Promise<boolean>} True, якщо повідомлення було успішно опубліковано в Redis.
     */
    async sendMessageToRoom(roomName, message) {
        const room = this.rooms.get(roomName)
        if (!room) {
            this.logger.warn(
                `Не вдалося надіслати повідомлення: кімната '${roomName}' не знайдена.`,
            )
            return false
        }
        await this.#publishToRedis(`room:${roomName}`, message)
        return true
    }

    /**
     * Надсилає повідомлення всім активним клієнтам, підключеним до менеджера кімнат, незалежно від їхньої кімнати.
     * Використовує глобальний Redis Pub/Sub канал.
     * @param {string | object | Buffer | ArrayBuffer} message - Повідомлення для надсилання.
     * @returns {Promise<boolean>} True, якщо повідомлення було успішно опубліковано в Redis.
     */
    async broadcastToAllClients(message) {
        await this.#publishToRedis('global_broadcast_channel', message)
        return true
    }

    // --- Приватні методи, які залишилися переважно без змін ---

    /**
     * Приватний метод для повного видалення клієнта з усіх кімнат, до яких він належить.
     * @private
     * @param {CustomWebSocket} clientWebSocket - Об'єкт WebSocket клієнта для видалення.
     * @returns {Promise<void>}
     */
    async #removeClientGlobally(clientWebSocket) {
        const clientIdentifier = clientWebSocket.username || clientWebSocket.id || 'unknown'
        this.logger.info(`Починаємо глобальне видалення клієнта: ${clientIdentifier}.`)

        const roomsOfClient = this.clientRoomMap.get(clientWebSocket)

        if (roomsOfClient) {
            const roomsToLeave = new Set(roomsOfClient) // Копія Set
            for (const roomName of roomsToLeave) {
                // Використовуємо for...of з await
                await this.leaveRoom(roomName, clientWebSocket)
            }
        } else {
            this.logger.debug(
                `Клієнт ${clientIdentifier} не знайдений у clientRoomMap. Можливо, вже видалено.`,
            )
        }

        this.clientRoomMap.delete(clientWebSocket)
        if (clientWebSocket.__closeHandlerRegistered) {
            delete clientWebSocket.__closeHandlerRegistered
        }
        if (clientWebSocket.myRooms) {
            delete clientWebSocket.myRooms // Очищаємо myRooms після обробки
        }

        this.logger.info(`Глобальне видалення клієнта ${clientIdentifier} завершено.`)
    }

    /**
     * Приватний метод для запуску періодичного надсилання даних клієнтам кімнати.
     * @private
     * @param {string} roomName - Назва кімнати.
     * @param {function(string, Set<CustomWebSocket>): Promise<string | object | Buffer | ArrayBuffer>} [updateCallback] - Асинхронна функція.
     * @param {number} [updateIntervalMs] - Інтервал оновлення у мілісекундах.
     * @param {boolean} [runInitialUpdate] - Чи запускати callback негайно.
     * @returns {null}
     */
    #startRoomDataUpdates(roomName, updateCallback, updateIntervalMs, runInitialUpdate) {
        const room = this.rooms.get(roomName)
        if (!room || room.intervalId) {
            this.logger.debug(
                `Інтервал для кімнати '${roomName}' вже запущений або кімната не існує.`,
            )
            return null
        }

        const sendUpdates = async () => {
            try {
                if (room.clients.size === 0) {
                    this.#stopRoomDataUpdates(roomName)
                    this.logger.info(
                        `Інтервал для кімнати '${roomName}' зупинено, бо кімната порожня.`,
                    )
                    return // Повертаємо, оскільки кімната вже порожня
                }

                const data = await updateCallback(roomName, room.clients)
                // Тут ми публікуємо оновлення в Redis, а не надсилаємо безпосередньо!
                // Кожен інстанс отримає це повідомлення і розішле своїм клієнтам.
                await this.#publishToRedis(`room:${roomName}`, data)
            } catch (error) {
                this.logger.error(
                    `[Room:${roomName}] Помилка отримання/надсилання даних: ${error.message}`,
                    error,
                )
            }
        }

        if (runInitialUpdate) {
            sendUpdates()
        }

        room.intervalId = setInterval(sendUpdates, updateIntervalMs)
        this.logger.info(
            `Інтервал оновлень для кімнати '${roomName}' запущено (${updateIntervalMs} мс).`,
        )
        return null
    }

    /**
     * Приватний метод для зупинки періодичного надсилання даних кімнати.
     * @private
     * @param {string} roomName - Назва кімнати.
     */
    #stopRoomDataUpdates(roomName) {
        const room = this.rooms.get(roomName)
        if (room && room.intervalId) {
            clearInterval(room.intervalId)
            room.intervalId = null
            this.logger.info(`Інтервал оновлень для кімнати '${roomName}' очищено.`)
        }
    }

    // --- Додаткові методи ---

    /**
     * Повертає кількість клієнтів у кімнаті на цьому локальному інстансі.
     * @param {string} roomName - Назва кімнати.
     * @returns {number} - Кількість клієнтів або 0, якщо кімната не існує.
     */
    getClientCount(roomName) {
        const room = this.rooms.get(roomName)
        return room ? room.clients.size : 0
    }

    /**
     * Повертає об'єкт конфігурації кімнати за назвою.
     * @param {string} roomName - Назва кімнати.
     * @returns {RoomConfig | undefined} - Об'єкт конфігурації кімнати або `undefined`, якщо кімната не знайдена.
     */
    getRoom(roomName) {
        return this.rooms.get(roomName)
    }
}

export default RoomManager
