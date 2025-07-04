/**
 * @file Клас RoomManager для управління WebSocket клієнтами та кімнатами.
 * Використовує Redis Pub/Sub для крос-процесної комунікації між інстансами сервера (потребує додаткової інтеграції).
 */

import WebSocket from 'ws'
import crypto from 'crypto'

/**
 * @typedef {object} RoomConfig
 * @property {Set<string>} clients - Множина УНІКАЛЬНИХ ID WebSocket клієнтів (конектів) у цій кімнаті.
 * @property {NodeJS.Timeout | null} intervalId - ID інтервалу для періодичних оновлень, якщо він активний.
 * @property {Function | null} updateCallback - Асинхронна функція, яка викликається для отримання даних для оновлення.
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
 * @extends {WebSocket}
 * @property {string} [id] - Унікальний ідентифікатор конкретного WebSocket-з'єднання (конекту). Генерується менеджером або надається ззовні.
 * @property {string} [userId] - Унікальний ідентифікатор користувача, асоційований з цим конектом (наприклад, з БД, з JWT). Один userId може мати декілька 'id' конектів.
 * @property {string} [username] - Ім'я користувача, асоційоване з клієнтом (з JWT), для логування.
 * @property {boolean} [__closeHandlerRegistered] - Внутрішній прапорець для відстеження реєстрації обробника 'close'.
 * @property {function(event: string, listener: Function): void} on - Додає слухача події WebSocket.
 * @property {function(data: string | ArrayBufferLike | Blob | Buffer): void} send - Надсилає дані через WebSocket.
 * @property {number} readyState - Поточний стан з'єднання WebSocket (наприклад, WebSocket.OPEN).
 */

/**
 * @class RoomsManager
 * @description Управляє WebSocket клієнтами (конектами) та кімнатами, забезпечуючи розсилку повідомлень
 * та періодичні оновлення даних у кімнатах. Підтримує розрізнення між унікальним ідентифікатором конекту (id)
 * та ідентифікатором користувача (userId), що дозволяє одному користувачеві мати кілька активних з'єднань.
 */
class RoomsManager {
    /**
     * Створює новий менеджер кімнат.
     * @param {object} options - Опції конструктора.
     * @param {Logger} [options.logger=console] - Об'єкт логера (наприклад, console, або кастомний логер з методами info, debug, warn, error).
     */
    constructor({ logger = console }) {
        /**
         * @private
         * @type {Map<string, RoomConfig>} або Map: chat_id -> Set<socket.id>
         * Зберігає інформацію про кімнати.
         * Ключ: roomName (string)
         * Значення: Об'єкт конфігурації кімнати (RoomConfig).
         */
        this.rooms = new Map()

        /**
         * @private
         * @type {Map<string, Set<string>>}
         * Зберігає, в яких кімнатах перебуває кожен КОНЕКТ (за його унікальним id).
         * Ключ: id конекту (string)
         * Значення: Set<string> - Назви кімнат, до яких належить цей конект.
         */
        this.clientRoomsMap = new Map()

        /**
         * @private
         * @type {Map<string, CustomWebSocket>}
         * Зберігає об'єкти CustomWebSocket за їхнім унікальним id конекту. (clients)
         * Це дозволяє швидко отримати об'єкт WebSocket за його id.
         * Ключ: id конекту (string)
         * Значення: CustomWebSocket
         */
        this.connectionsById = new Map()

        /**
         * @private
         * @type {Map<string, Set<string>>}
         * Зберігає id конектів, що належать кожному користувачеві.
         * Це дозволяє знайти всі активні з'єднання для даного userId.
         * Ключ: userId (string)
         * Значення: Set<string> - Набір id конектів цього користувача.
         */
        this.userConnectionsMap = new Map()

        /**
         * @private
         * @type {Logger}
         * Об'єкт логера.
         */
        this.logger = logger
    }

    /**
     * Приватний допоміжний метод для отримання стандартизованого ідентифікатора клієнта (конекту) для логування.
     * Поєднує ID конекту, ID користувача та ім'я користувача для повної інформації.
     * @private
     * @param {CustomWebSocket} clientWebSocket - Об'єкт WebSocket клієнта (конекту).
     * @returns {string} Стандартизований рядок для ідентифікації конекту.
     */
    #getClientIdentifier(clientWebSocket) {
        if (!clientWebSocket) {
            return 'Invalid Client Object'
        }
        const connId = clientWebSocket.id || 'N/A'
        const userId = clientWebSocket.userId ? ` (User: ${clientWebSocket.userId})` : ''
        const username = clientWebSocket.username ? ` (Username: ${clientWebSocket.username})` : ''

        return `Connection ID: ${connId}${userId}${username}`
    }

    /**
     * Створює нову кімнату, якщо її ще немає.
     * Якщо кімната вже існує, ця функція нічого не робить і повертає `null`.
     *
     * @param {string} roomName - Унікальна назва кімнати.
     * @param {function(string, Set<CustomWebSocket>): Promise<string | object | Buffer | ArrayBuffer>} [updateCallback=async () => null] - Асинхронна функція, яка повертає дані для оновлення клієнтів (рядок, об'єкт, або бінарні дані). Приймає `roomName` та `Set<CustomWebSocket>` (набір підключених конектів) як аргументи.
     * @param {number} [updateIntervalMs=0] - Інтервал у мілісекундах для періодичних оновлень. 0 вимикає оновлення.
     * @param {boolean} [runInitialUpdate=false] - Чи запускати `updateCallback` негайно при першому старті інтервалу.
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
     * Додає клієнта (конект) до вказаної кімнати.
     * Якщо кімната не існує, вона буде автоматично створена з наданими параметрами.
     * Запускає періодичні оновлення для кімнати, якщо це перший клієнт і налаштований інтервал > 0.
     * Реєструє конект у внутрішніх мапах (`connectionsById`, `clientRoomsMap`, `userConnectionsMap`)
     * та додає обробник події 'close' для автоматичного видалення.
     *
     * @param {string} roomName - Назва кімнати, до якої приєднати конект.
     * @param {CustomWebSocket} clientWebSocket - Об'єкт WebSocket клієнта (конекту). Повинен мати властивості `id` (унікальний ID конекту) та бажано `userId`.
     * @param {function(string, Set<CustomWebSocket>): Promise<string | object | Buffer | ArrayBuffer>} [updateCallback=async () => null] - Асинхронна функція для отримання даних для оновлення. Використовується, якщо кімната створюється.
     * @param {number} [updateIntervalMs=0] - Інтервал оновлення (в мс). Використовується, якщо кімната створюється.
     * @param {boolean} [runInitialUpdate=false] - Чи запускати callback негайно. Використовується, якщо кімната створюється.
     * @returns {boolean} - True, якщо конект додано; false, якщо кімната не знайдена/не створена, або конект вже в кімнаті.
     */
    joinRoom(
        roomName,
        clientWebSocket,
        updateCallback = async () => null,
        updateIntervalMs = 0,
        runInitialUpdate = false,
    ) {
        let room = this.rooms.get(roomName)

        if (!room) {
            // Створення кімнати через внутрішній виклик createRoom
            this.createRoom(roomName, updateCallback, updateIntervalMs, runInitialUpdate)
            room = this.rooms.get(roomName) // Отримуємо новостворену кімнату
            if (!room) {
                this.logger.error(`Не вдалося отримати або створити кімнату '${roomName}'.`)
                return false
            }
        }

        // Клієнт (конект) повинен мати унікальний ID. Генеруємо, якщо немає (але краще це робити на етапі створення WS).
        if (!clientWebSocket.id) {
            clientWebSocket.id = crypto.randomUUID()
            this.logger.warn(`Клієнт приєднався без id конекту. Генеруємо: ${clientWebSocket.id}`)
        }
        const clientIdentifier = this.#getClientIdentifier(clientWebSocket)

        // Перевіряємо, чи конект вже є в кімнаті, щоб уникнути дублікатів у Set
        if (room.clients.has(clientWebSocket.id)) {
            this.logger.debug(`Конект ${clientIdentifier} вже знаходиться в кімнаті '${roomName}'.`)
            return false
        }

        // 1. Додаємо конект до загальної мапи активних конектів
        this.connectionsById.set(clientWebSocket.id, clientWebSocket)

        // 2. Додаємо id конекту до мапи userConnectionsMap (якщо є userId)
        if (clientWebSocket.userId) {
            if (!this.userConnectionsMap.has(clientWebSocket.userId)) {
                this.userConnectionsMap.set(clientWebSocket.userId, new Set())
            }
            this.userConnectionsMap.get(clientWebSocket.userId).add(clientWebSocket.id)
            this.logger.debug(
                `Конект ${clientWebSocket.id} додано до користувача ${clientWebSocket.userId}.`,
            )
        }

        // 3. Додаємо конект до кімнати
        room.clients.add(clientWebSocket.id)

        // 4. Оновлюємо clientRoomsMap: додаємо кімнату до списку кімнат конекту
        if (!this.clientRoomsMap.has(clientWebSocket.id)) {
            this.clientRoomsMap.set(clientWebSocket.id, new Set())
        }
        this.clientRoomsMap.get(clientWebSocket.id).add(roomName)

        this.logger.debug(
            `Конект ${clientIdentifier} приєднався до кімнати '${roomName}'. Всього конектів у кімнаті: ${room.clients.size}`,
        )

        // Запускаємо оновлення, якщо це перший конект у кімнаті та налаштований інтервал
        if (room.clients.size === 1 && room.updateIntervalMs > 0) {
            this.#startRoomDataUpdates(
                roomName,
                room.updateCallback,
                room.updateIntervalMs,
                room.runInitialUpdate,
            )
        }

        // Додаємо обробник події 'close' для автоматичного видалення конекту з усіх кімнат.
        // Додаємо обробник лише один раз при першому приєднанні конекту.
        if (!clientWebSocket.__closeHandlerRegistered) {
            clientWebSocket.__closeHandlerRegistered = true
            clientWebSocket.on('close', () => {
                this.removeClientGlobally(clientWebSocket.id) // Передаємо ID конекту
            })
            this.logger.debug(`Обробник 'close' для конекту ${clientIdentifier} зареєстровано.`)
        }

        return true
    }

    /**
     * Видаляє клієнта (конект) з кімнати.
     * Якщо кімната стає порожньою, її інтервал оновлення зупиняється і кімната видаляється.
     * Також оновлює `clientRoomsMap` та `userConnectionsMap`.
     *
     * @param {string} roomName - Назва кімнати.
     * @param {CustomWebSocket} clientWebSocket - Об'єкт WebSocket клієнта (конекту) для видалення.
     * @returns {boolean} - True, якщо конект видалено; false, якщо кімната або конект не знайдено.
     */
    leaveRoom(roomName, clientWebSocket) {
        const clientIdentifier = this.#getClientIdentifier(clientWebSocket)

        const room = this.rooms.get(roomName)
        if (!room) {
            this.logger.warn(
                `Кімната '${roomName}' не знайдена при спробі видалення конекту ${clientIdentifier}.`,
            )
            return false
        }

        if (room.clients.delete(clientWebSocket.id)) {
            this.logger.debug(
                `Конект ${clientIdentifier} покинув кімнату '${roomName}'. Залишилось конектів: ${room.clients.size}`,
            )

            // 1. Оновлюємо clientRoomsMap: видаляємо кімнату зі списку кімнат конекту
            const clientRooms = this.clientRoomsMap.get(clientWebSocket.id)
            if (clientRooms) {
                clientRooms.delete(roomName)
                if (clientRooms.size === 0) {
                    this.clientRoomsMap.delete(clientWebSocket.id) // Якщо конект не входить до інших кімнат, видаляємо його з мапи
                    this.logger.debug(
                        `Конект ${clientIdentifier} повністю видалено з clientRoomsMap.`,
                    )
                }
            }

            // 2. Оновлюємо userConnectionsMap: видаляємо конект зі списку конектів користувача
            if (clientWebSocket.userId) {
                const userConnections = this.userConnectionsMap.get(clientWebSocket.userId)
                if (userConnections) {
                    userConnections.delete(clientWebSocket.id)
                    if (userConnections.size === 0) {
                        this.userConnectionsMap.delete(clientWebSocket.userId) // Якщо користувач не має інших активних конектів, видаляємо його з мапи
                        this.logger.debug(
                            `Користувач ${clientWebSocket.userId} більше не має активних конектів.`,
                        )
                    }
                }
            }

            // Якщо кімната стала порожньою, зупиняємо її оновлення та видаляємо
            if (room.clients.size === 0) {
                this.#stopRoomDataUpdates(roomName)
                this.rooms.delete(roomName)
                this.logger.info(`Кімнату '${roomName}' видалено, оскільки вона порожня.`)
            }

            return true
        }

        this.logger.debug(`Конект ${clientIdentifier} не був знайдений у кімнаті '${roomName}'.`)
        return false
    }

    /**
     * Приватний допоміжний метод для підготовки повідомлення для відправки.
     * Серіалізує об'єкти в JSON, залишає рядки та бінарні дані як є.
     * @private
     * @param {string | object | Buffer | ArrayBuffer} message - Повідомлення для підготовки.
     * @returns {string | Buffer | ArrayBuffer} Готове для відправки навантаження.
     */
    #prepareMessagePayload(message) {
        if (
            typeof message === 'object' &&
            message !== null &&
            !Buffer.isBuffer(message) &&
            !(message instanceof ArrayBuffer)
        ) {
            // Якщо це об'єкт (але не бінарний буфер), серіалізуємо його в JSON рядок
            return JSON.stringify(message)
        }
        // Якщо це рядок, Buffer або ArrayBuffer - надсилаємо як є
        return message
    }

    /**
     * Приватний допоміжний метод для надсилання повідомлення конкретному конекту.
     * Інкапсулює логіку відправки, логування та обробки помилок/неактивних конектів.
     * Автоматично викликає `removeClientGlobally` для неактивних конектів або у випадку помилки відправки.
     * @private
     * @param {CustomWebSocket} clientWebSocket - Об'єкт WebSocket клієнта, якому надсилається повідомлення.
     * @param {string | Buffer | ArrayBuffer} payloadToSend - Підготовлене навантаження для надсилання.
     * @param {string} [contextMessage=''] - Додатковий контекст для логування (наприклад, "Глобальна розсилка", "До кімнати 'X'").
     * @returns {boolean} - True, якщо повідомлення успішно надіслано; false в іншому випадку.
     */
    sendClientMessage(clientWebSocket, payloadToSend, contextMessage = '') {
        const clientIdentifier = this.#getClientIdentifier(clientWebSocket)

        // Перевіряємо, чи з'єднання активне (OPEN = 1, WebSocket.OPEN)
        if (clientWebSocket.readyState === WebSocket.OPEN) {
            try {
                clientWebSocket.send(payloadToSend)

                const logMessage =
                    Buffer.isBuffer(payloadToSend) || payloadToSend instanceof ArrayBuffer
                        ? `[Binary Data, ${payloadToSend.byteLength || payloadToSend.length} bytes]`
                        : String(payloadToSend).substring(0, 50) +
                          (typeof payloadToSend === 'string' && String(payloadToSend).length > 50
                              ? '...'
                              : '')
                this.logger.debug(
                    `${contextMessage} Надіслано конекту ${clientIdentifier}: '${logMessage}'.`,
                )
                return true
            } catch (error) {
                this.logger.error(
                    `Помилка надсилання повідомлення ${
                        contextMessage ? `(${contextMessage}) ` : ''
                    }конекту ${clientIdentifier}: ${error.message}`,
                    error,
                )
                this.removeClientGlobally(clientWebSocket.id) // Видаляємо проблемний конект
                return false
            }
        } else {
            this.logger.warn(
                `Конект ${clientIdentifier} неактивний (readyState: ${clientWebSocket.readyState})${
                    contextMessage ? ` (${contextMessage})` : ''
                }. Видалення.`,
            )
            this.removeClientGlobally(clientWebSocket.id) // Видаляємо неактивний конект
            return false
        }
    }

    /**
     * Надсилає повідомлення всім активним конектам у вказаній кімнаті (broadcastToRoom).
     * Повідомлення може бути рядком, об'єктом (буде JSON.stringify) або бінарними даними (Buffer, ArrayBuffer).
     * Автоматично видаляє неактивні конекти.
     *
     * @param {string} roomName - Назва кімнати.
     * @param {string | object | Buffer | ArrayBuffer} message - Повідомлення для надсилання. Якщо об'єкт, буде серіалізовано в JSON.
     * @returns {number | null} Кількість конектів, яким було надіслано повідомлення, або `null`, якщо кімната не знайдена.
     */
    sendMessageToRoom(roomName, message) {
        const room = this.rooms.get(roomName)
        if (!room) {
            this.logger.warn(
                `Не вдалося надіслати повідомлення: кімната '${roomName}' не знайдена.`,
            )
            return null
        }

        const payloadToSend = this.#prepareMessagePayload(message)
        let sentCount = 0
        // Створюємо копію Set на випадок, якщо конекти будуть видалені під час ітерації
        const clientIdsToProcess = Array.from(room.clients)

        clientIdsToProcess.forEach((clientWebSocketId) => {
            const clientWebSocket = this.connectionsById.get(clientWebSocketId)

            if (!clientWebSocket) {
                room.clients.delete(clientWebSocketId)
                this.logger.warn(
                    `ID конекту '${clientWebSocketId}' знайдено в кімнаті '${roomName}' але немає в connectionsById. Видалення з кімнати.`,
                )
            }

            if (
                this.sendClientMessage(clientWebSocket, payloadToSend, `До кімнати '${roomName}'`)
            ) {
                sentCount++
            }
        })

        // Якщо після надсилання повідомлень кімната стала порожньою через видалення неактивних конектів
        if (room.clients.size === 0) {
            this.#stopRoomDataUpdates(roomName)
            this.rooms.delete(roomName)
            this.logger.info(
                `Кімнату '${roomName}' видалено, оскільки вона порожня після чистки неактивних конектів.`,
            )
        }

        return sentCount
    }

    /**
     * Приватний метод для повного видалення конекту з усіх кімнат, до яких він належить,
     * а також з усіх внутрішніх мап (`connectionsById`, `clientRoomsMap`, `userConnectionsMap`).
     * Викликається при закритті WebSocket-з'єднання конекту або виявленні його неактивності.
     * @private
     * @param {string} connectionId - Унікальний ідентифікатор конекту для видалення.
     * @returns {void}
     */
    removeClientGlobally(connectionId) {
        const clientWebSocket = this.connectionsById.get(connectionId)
        if (!clientWebSocket) {
            this.logger.debug(
                `Конект з ID '${connectionId}' не знайдено для глобального видалення. Можливо, вже видалено.`,
            )
            return
        }

        const clientIdentifier = this.#getClientIdentifier(clientWebSocket)
        this.logger.info(`Починаємо глобальне видалення конекту: ${clientIdentifier}.`)

        // 1. Видаляємо конект з усіх кімнат, до яких він належав
        const roomsOfClient = this.clientRoomsMap.get(connectionId)
        if (roomsOfClient) {
            // Ітеруємо по копії Set, бо leaveRoom модифікує clientRoomsMap
            const roomsToLeave = new Set(roomsOfClient)
            roomsToLeave.forEach((roomName) => {
                this.leaveRoom(roomName, clientWebSocket) // Викликаємо leaveRoom, передаючи сам об'єкт WS
            })
        }

        // 2. Видаляємо конект з userConnectionsMap (якщо він там є)
        if (clientWebSocket.userId) {
            const userConnections = this.userConnectionsMap.get(clientWebSocket.userId)
            if (userConnections) {
                userConnections.delete(connectionId)
                if (userConnections.size === 0) {
                    this.userConnectionsMap.delete(clientWebSocket.userId)
                    this.logger.debug(
                        `Користувач ${clientWebSocket.userId} більше не має активних конектів.`,
                    )
                }
            }
        }

        // 3. Видаляємо конект з основної мапи connectionsById
        this.connectionsById.delete(connectionId)

        // Очищаємо прапорець обробника 'close', якщо об'єкт WS буде перевикористаний (що рідко відбувається після закриття)
        if (clientWebSocket.__closeHandlerRegistered) {
            delete clientWebSocket.__closeHandlerRegistered
            // Якщо необхідно, тут можна також явно видалити слухача:
            // clientWebSocket.off('close', <оригінальна функція-обробник>);
        }

        this.logger.info(`Глобальне видалення конекту ${clientIdentifier} завершено.`)
    }

    /**
     * Приватний метод для запуску періодичного надсилання даних клієнтам кімнати.
     * Цей метод викликається, коли перший конект приєднується до кімнати, якщо `updateIntervalMs` > 0.
     * @private
     * @param {string} roomName - Назва кімнати.
     * @param {function(string, Set<CustomWebSocket>): Promise<string | object | Buffer | ArrayBuffer>} updateCallback - Асинхронна функція для отримання даних для оновлення.
     * @param {number} updateIntervalMs - Інтервал оновлення у мілісекундах.
     * @param {boolean} runInitialUpdate - Чи запускати callback при першому старті інтервалу (негайно).
     * @returns {void}
     */
    #startRoomDataUpdates(roomName, updateCallback, updateIntervalMs, runInitialUpdate) {
        const room = this.rooms.get(roomName)
        if (!room || room.intervalId) {
            this.logger.debug(
                `Інтервал для кімнати '${roomName}' вже запущений або кімната не існує.`,
            )
            return // Змінено на void
        }

        const sendUpdates = async () => {
            try {
                // Якщо клієнтів більше немає, зупиняємо інтервал
                if (room.clients.size === 0) {
                    this.#stopRoomDataUpdates(roomName)
                    this.logger.info(
                        `Інтервал для кімнати '${roomName}' зупинено, бо кімната порожня.`,
                    )
                    return // Змінено на void
                }

                const activeRoomClients = new Set()
                for (const clientId of room.clients) {
                    const clientWs = this.connectionsById.get(clientId)
                    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
                        activeRoomClients.add(clientWs)
                    } else {
                        // Якщо конект неактивний, видаляємо його з кімнати, щоб підтримувати чистоту Set
                        room.clients.delete(clientId)
                        this.logger.debug(
                            `Неактивний конект '${clientId}' видалено з кімнати '${roomName}' під час оновлення.`,
                        )
                    }
                }

                // Якщо після фільтрації не залишилось активних клієнтів, зупиняємо інтервал
                if (activeRoomClients.size === 0) {
                    this.#stopRoomDataUpdates(roomName)
                    this.logger.info(
                        `Інтервал для кімнати '${roomName}' зупинено, бо після чистки немає активних конектів.`,
                    )
                    return
                }

                const data = await updateCallback(roomName, activeRoomClients)
                if (data === null || data === undefined) {
                    // Перевірка на null/undefined
                    this.logger.debug(
                        `updateCallback для кімнати '${roomName}' повернув пусті дані.`,
                    )
                    return
                }

                // Перевикористовуємо sendMessageToRoom для надсилання даних
                const sentCount = this.sendMessageToRoom(roomName, data)

                if (sentCount !== null && sentCount === 0 && room.clients.size > 0) {
                    this.logger.debug(
                        `sendMessageToRoom не надіслала жодного повідомлення, хоча конекти є в кімнаті '${roomName}', їх: ${room.clients.size}`,
                    )
                }
            } catch (error) {
                this.logger.error(
                    `[Room:${roomName}] Помилка отримання/надсилання даних: ${error.message}`,
                    error,
                )
            }
        }

        if (runInitialUpdate) {
            sendUpdates() // Виконати один раз негайно
        }

        room.intervalId = setInterval(sendUpdates, updateIntervalMs)

        this.logger.info(
            `Інтервал оновлень для кімнати '${roomName}' запущено (${updateIntervalMs} мс).`,
        )
    }

    /**
     * Приватний метод для зупинки періодичного надсилання даних кімнати.
     * Викликається, коли всі клієнти покидають кімнату.
     * @private
     * @param {string} roomName - Назва кімнати.
     * @returns {void}
     */
    #stopRoomDataUpdates(roomName) {
        const room = this.rooms.get(roomName)
        if (room && room.intervalId) {
            clearInterval(room.intervalId)
            room.intervalId = null
            this.logger.info(`Інтервал оновлень для кімнати '${roomName}' очищено.`)
        }
    }

    /**
     * Надсилає повідомлення всім активним конектам, підключеним до менеджера кімнат, незалежно від їхньої кімнати.
     * Ітерує по `this.connectionsById` для ефективнішої розсилки та активного видалення неактивних конектів.
     *
     * @param {string | object | Buffer | ArrayBuffer} message - Повідомлення для надсилання. Якщо об'єкт, буде серіалізовано в JSON.
     * @returns {number} Кількість конектів, яким було надіслано повідомлення.
     */
    broadcastToAllClients(message) {
        const payloadToSend = this.#prepareMessagePayload(message)
        let sentCount = 0

        // Ітеруємо по значенням connectionsById, які є об'єктами CustomWebSocket
        // Створюємо копію значень, щоб уникнути проблем, якщо конекти будуть видалені під час ітерації
        const connectionsToProcess = Array.from(this.connectionsById.values())

        for (const clientWebSocket of connectionsToProcess) {
            if (this.sendClientMessage(clientWebSocket, payloadToSend, 'Глобальна розсилка')) {
                sentCount++
            }
        }
        return sentCount
    }

    /**
     * Надсилає повідомлення конкретному конекту за його унікальним ідентифікатором (`id`).
     *
     * @param {string} connectionId - Унікальний ідентифікатор конекту (id) для надсилання повідомлення.
     * @param {string | object | Buffer | ArrayBuffer} message - Повідомлення для надсилання. Якщо об'єкт, буде серіалізовано в JSON.
     * @returns {boolean} - True, якщо повідомлення надіслано; false, якщо конект не знайдено, він неактивний або виникла помилка.
     */
    sendMessageToClient(connectionId, message) {
        const targetClient = this.connectionsById.get(connectionId) // Шукаємо конект за його ID

        if (!targetClient) {
            this.logger.warn(`Конект з ID '${connectionId}' не знайдений.`)
            return false
        }

        const payloadToSend = this.#prepareMessagePayload(message)
        return this.sendClientMessage(targetClient, payloadToSend, 'Приватне повідомлення')
    }

    /**
     * Надсилає повідомлення всім активним конектам конкретного користувача за його userId.
     * Цей метод ітерує по всіх з'єднаннях, зареєстрованих для цього користувача, і намагається надіслати їм повідомлення.
     * Неактивні конекти автоматично видаляються.
     *
     * @param {string} userId - Унікальний ідентифікатор користувача.
     * @param {string | object | Buffer | ArrayBuffer} message - Повідомлення для надсилання. Якщо об'єкт, буде серіалізовано в JSON.
     * @returns {number} Кількість конектів, яким було надіслано повідомлення.
     */
    sendMessageToUser(userId, message) {
        const userConnectionIds = this.userConnectionsMap.get(userId)
        if (!userConnectionIds || userConnectionIds.size === 0) {
            this.logger.warn(`Користувач з ID '${userId}' не має активних конектів.`)
            return 0
        }

        const payloadToSend = this.#prepareMessagePayload(message)
        let sentCount = 0

        // Створюємо копію Set, щоб безпечно ітерувати та модифікувати оригінальний Set,
        // якщо якийсь конект буде видалено під час циклу.
        const connectionIdsToProcess = new Set(userConnectionIds)

        for (const connectionId of connectionIdsToProcess) {
            const clientWebSocket = this.connectionsById.get(connectionId)

            // Якщо конект вже був видалений з connectionsById, очищаємо його і з userConnectionIds
            if (!clientWebSocket) {
                this.logger.warn(
                    `Конект з ID '${connectionId}' для користувача '${userId}' не знайдено в connectionsById. Видалення з userConnectionsMap.`,
                )
                userConnectionIds.delete(connectionId)
                if (userConnectionIds.size === 0) {
                    this.userConnectionsMap.delete(userId)
                }
                continue
            }

            if (this.sendClientMessage(clientWebSocket, payloadToSend, `Користувачу '${userId}'`)) {
                sentCount++
            }
        }
        return sentCount
    }

    /**
     * Перевіряє, чи має користувач (за `userId`) хоча б один активний конект у вказаній кімнаті.
     *
     * @param {string} userId - Унікальний ідентифікатор користувача.
     * @param {string} roomName - Назва кімнати, яку потрібно перевірити.
     * @returns {boolean} - `true`, якщо користувач має конект у кімнаті; `false` в іншому випадку.
     */
    isUserInRoom(userId, roomName) {
        const userConnectionIds = this.userConnectionsMap.get(userId)
        if (!userConnectionIds || userConnectionIds.size === 0) {
            return false // Користувач не має активних конектів взагалі
        }

        const room = this.rooms.get(roomName)
        if (!room) {
            return false // Кімната не існує
        }

        // Перевіряємо, чи є хоча б один конект користувача в Set клієнтів кімнати
        for (const connId of userConnectionIds) {
            if (room.clients.has(connId)) {
                return true // Знайдено активний конект користувача в цій кімнаті
            }
        }

        return false // Жоден конект користувача не знайдено в цій кімнаті
    }

    /**
     * Повертає набір назв кімнат, у яких перебуває даний користувач (через будь-який з його активних конектів).
     *
     * @param {string} userId - Унікальний ідентифікатор користувача.
     * @returns {Set<string>} - Набір назв кімнат, у яких перебуває користувач. Порожній Set, якщо користувач не має конектів або не перебуває в жодній кімнаті.
     */
    getUserRooms(userId) {
        const userConnectionIds = this.userConnectionsMap.get(userId)
        if (!userConnectionIds || userConnectionIds.size === 0) {
            return new Set() // Користувач не має активних конектів взагалі
        }

        const roomsForUser = new Set()
        for (const connId of userConnectionIds) {
            const clientRooms = this.clientRoomsMap.get(connId)
            if (clientRooms) {
                // Додаємо всі кімнати цього конекту до загального набору кімнат користувача
                clientRooms.forEach((roomName) => roomsForUser.add(roomName))
            }
        }

        return roomsForUser
    }

    /**
     * Повертає кількість активних конектів у кімнаті.
     *
     * @param {string} roomName - Назва кімнати.
     * @returns {number} - Кількість конектів або 0, якщо кімната не існує.
     */
    getClientCount(roomName) {
        const room = this.rooms.get(roomName)
        return room ? room.clients.size : 0
    }

    /**
     * Повертає об'єкт конфігурації кімнати за назвою.
     * Може бути корисним для розширених операцій або перевірок.
     *
     * @param {string} roomName - Назва кімнати.
     * @returns {RoomConfig | undefined} - Об'єкт конфігурації кімнати або `undefined`, якщо кімната не знайдена.
     */
    getRoom(roomName) {
        const room = this.rooms.get(roomName)
        if (!room) {
            return undefined
        }

        return room
    }

    /**
     * Повертає об'єкт CustomWebSocket за його унікальним id конекту.
     *
     * @param {string} connectionId - Унікальний ідентифікатор конекту.
     * @returns {CustomWebSocket | undefined} Об'єкт CustomWebSocket або `undefined`, якщо конект не знайдено.
     */
    getConnectionById(connectionId) {
        return this.connectionsById.get(connectionId)
    }

    /**
     * Повертає набір унікальних id конектів, що належать певному користувачеві.
     *
     * @param {string} userId - Унікальний ідентифікатор користувача.
     * @returns {Set<string> | undefined} Набір id конектів користувача або `undefined`, якщо користувач не має активних конектів.
     */
    getUserConnections(userId) {
        const connections = this.userConnectionsMap.get(userId)
        return connections ? connections : undefined
    }
}

export default RoomsManager
