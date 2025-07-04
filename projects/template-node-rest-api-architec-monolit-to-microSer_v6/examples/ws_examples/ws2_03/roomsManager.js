/**
 * @file Клас RoomManager для управління WebSocket клієнтами та кімнатами.
 * Використовує Redis Pub/Sub для крос-процесної комунікації між інстансами сервера (потребує додаткової інтеграції).
 */

import WebSocket from 'ws'
import crypto from 'crypto'

/**
 * @typedef {object} RoomConfig
 * @property {Set<CustomWebSocket>} clients - Множина підключених WebSocket клієнтів (конектів) у цій кімнаті.
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
 * @property {string} [_namespace] - Внутрішній прапорець, доданий NamespaceManager.
 * @property {string} [_roomKey] - Внутрішній прапорець, доданий NamespaceManager.
 * @property {object} [_params] - Внутрішній прапорець, доданий NamespaceManager.
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
         * @type {Map<string, RoomConfig>}
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
         * Зберігає об'єкти CustomWebSocket за їхнім унікальним id конекту.
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
            this.createRoom(roomName, updateCallback, updateIntervalMs, runInitialUpdate)
            room = this.rooms.get(roomName)
            if (!room) {
                this.logger.error(`Не вдалося отримати або створити кімнату '${roomName}'.`)
                return false
            }
        }

        if (!clientWebSocket.id) {
            clientWebSocket.id = crypto.randomUUID()
            this.logger.warn(`Клієнт приєднався без id конекту. Генеруємо: ${clientWebSocket.id}`)
        }
        const clientIdentifier = this.#getClientIdentifier(clientWebSocket)

        if (room.clients.has(clientWebSocket)) {
            this.logger.debug(`Конект ${clientIdentifier} вже знаходиться в кімнаті '${roomName}'.`)
            return false
        }

        this.connectionsById.set(clientWebSocket.id, clientWebSocket)

        if (clientWebSocket.userId) {
            if (!this.userConnectionsMap.has(clientWebSocket.userId)) {
                this.userConnectionsMap.set(clientWebSocket.userId, new Set())
            }
            this.userConnectionsMap.get(clientWebSocket.userId).add(clientWebSocket.id)
            this.logger.debug(
                `Конект ${clientWebSocket.id} додано до користувача ${clientWebSocket.userId}.`,
            )
        }

        room.clients.add(clientWebSocket)

        if (!this.clientRoomsMap.has(clientWebSocket.id)) {
            this.clientRoomsMap.set(clientWebSocket.id, new Set())
        }
        this.clientRoomsMap.get(clientWebSocket.id).add(roomName)

        this.logger.debug(
            `Конект ${clientIdentifier} приєднався до кімнати '${roomName}'. Всього конектів у кімнаті: ${room.clients.size}`,
        )

        if (room.clients.size === 1 && room.updateIntervalMs > 0) {
            this.#startRoomDataUpdates(
                roomName,
                room.updateCallback,
                room.updateIntervalMs,
                room.runInitialUpdate,
            )
        }

        if (!clientWebSocket.__closeHandlerRegistered) {
            clientWebSocket.__closeHandlerRegistered = true
            clientWebSocket.on('close', () => {
                this.removeClientGlobally(clientWebSocket.id)
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

        if (room.clients.delete(clientWebSocket)) {
            this.logger.debug(
                `Конект ${clientIdentifier} покинув кімнату '${roomName}'. Залишилось конектів: ${room.clients.size}`,
            )

            const clientRooms = this.clientRoomsMap.get(clientWebSocket.id)
            if (clientRooms) {
                clientRooms.delete(roomName)
                if (clientRooms.size === 0) {
                    this.clientRoomsMap.delete(clientWebSocket.id)
                    this.logger.debug(
                        `Конект ${clientIdentifier} повністю видалено з clientRoomsMap.`,
                    )
                }
            }

            if (clientWebSocket.userId) {
                const userConnections = this.userConnectionsMap.get(clientWebSocket.userId)
                if (userConnections) {
                    userConnections.delete(clientWebSocket.id)
                    if (userConnections.size === 0) {
                        this.userConnectionsMap.delete(clientWebSocket.userId)
                        this.logger.debug(
                            `Користувач ${clientWebSocket.userId} більше не має активних конектів.`,
                        )
                    }
                }
            }

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
            return JSON.stringify(message)
        }
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
                this.removeClientGlobally(clientWebSocket.id)
                return false
            }
        } else {
            this.logger.warn(
                `Конект ${clientIdentifier} неактивний (readyState: ${clientWebSocket.readyState})${
                    contextMessage ? ` (${contextMessage})` : ''
                }. Видалення.`,
            )
            this.removeClientGlobally(clientWebSocket.id)
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
        const clientsToProcess = Array.from(room.clients)

        clientsToProcess.forEach((clientWebSocket) => {
            if (
                this.sendClientMessage(clientWebSocket, payloadToSend, `До кімнати '${roomName}'`)
            ) {
                sentCount++
            }
        })

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

        const roomsOfClient = this.clientRoomsMap.get(connectionId)
        if (roomsOfClient) {
            const roomsToLeave = new Set(roomsOfClient)
            roomsToLeave.forEach((roomName) => {
                this.leaveRoom(roomName, clientWebSocket)
            })
        }

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

        this.connectionsById.delete(connectionId)

        if (clientWebSocket.__closeHandlerRegistered) {
            delete clientWebSocket.__closeHandlerRegistered
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
            return
        }

        const sendUpdates = async () => {
            try {
                if (room.clients.size === 0) {
                    this.#stopRoomDataUpdates(roomName)
                    this.logger.info(
                        `Інтервал для кімнати '${roomName}' зупинено, бо кімната порожня.`,
                    )
                    return
                }

                const data = await updateCallback(roomName, room.clients)
                if (data === null || data === undefined) {
                    this.logger.debug(
                        `updateCallback для кімнати '${roomName}' повернув пусті дані.`,
                    )
                    return
                }

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
            sendUpdates()
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
        const targetClient = this.connectionsById.get(connectionId)

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

        const connectionIdsToProcess = new Set(userConnectionIds)

        for (const connectionId of connectionIdsToProcess) {
            const clientWebSocket = this.connectionsById.get(connectionId)

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
            return false
        }

        const room = this.rooms.get(roomName)
        if (!room) {
            return false
        }

        for (const connId of userConnectionIds) {
            const clientWebSocket = this.connectionsById.get(connId)
            if (clientWebSocket && room.clients.has(clientWebSocket)) {
                return true
            }
        }

        return false
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
            return new Set()
        }

        const roomsForUser = new Set()
        for (const connId of userConnectionIds) {
            const clientRooms = this.clientRoomsMap.get(connId)
            if (clientRooms) {
                clientRooms.forEach((roomName) => roomsForUser.add(roomName))
            }
        }

        return roomsForUser
    }
}

export default RoomsManager
