import WebSocket from 'ws'

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
 * @property {string} [id] - Унікальний ідентифікатор клієнта (для цього з'єднання).
 * @property {string} [userId] - Унікальний ідентифікатор користувача (з БД, з JWT).
 * @property {string} [username] - Ім'я користувача, асоційоване з клієнтом (з JWT).
 * @property {boolean} [__closeHandlerRegistered] - Внутрішній прапорець для відстеження реєстрації обробника 'close'.
 * @method {function(event: string, listener: Function): void} on - Додає слухача події.
 * @method {function(data: string | ArrayBufferLike | Blob | Buffer): void} send - Надсилає дані через WebSocket.
 */

//
class RoomsManager {
    /**
     * Створює новий менеджер кімнат.
     * @param {object} logger Об'єкт логера (наприклад, console, або кастомний логер з методами info, debug, warn, error).
     */
    constructor(logger = console) {
        /**
         * @private
         * @type {Map<string, { clients: Set<WebSocket>, intervalId: NodeJS.Timeout | null, updateCallback: Function | null, updateIntervalMs: number, runInitialUpdate: boolean }>}
         * Зберігає інформацію про кімнати.
         * Ключ: roomName (string)
         * Значення: Об'єкт з даними кімнати.
         * - clients: Set<WebSocket> - Множина підключених WebSocket клієнтів.
         * - intervalId: NodeJS.Timeout | null - ID інтервалу для періодичних оновлень, якщо він активний.
         * - updateCallback: Function | null - Функція, яка викликається для отримання даних для оновлення.
         * - updateIntervalMs: number - Інтервал у мілісекундах для оновлень.
         * - runInitialUpdate: boolean - Чи запускати callback при першому старті інтервалу.
         */
        this.rooms = new Map()

        /**
         * @private
         * @type {Map<CustomWebSocket, Set<string>>}
         * Зберігає, в яких кімнатах перебуває кожен клієнт.
         * Ключ: CustomWebSocket клієнт
         * Значення: Set<string> - Назви кімнат, до яких належить цей клієнт.
         * - id: string - Унікальний ідентифікатор клієнта.
         * - username: string - Ім'я користувача, асоційоване з клієнтом.
         * - __closeHandlerRegistered: boolean - Внутрішній прапорець для відстеження реєстрації обробника 'close'.
         * - on: Function - Додає слухача події
         * - send: Function - Надсилає дані через WebSocket.
         */
        this.clientRoomsMap = new Map()

        /**
         * @private
         */
        this.logger = logger
    }

    /**
     * Приватний допоміжний метод для отримання стандартизованого ідентифікатора клієнта.
     * @private
     * @param {CustomWebSocket} clientWebSocket - Об'єкт WebSocket клієнта.
     * @returns {string} Стандартизований рядок для ідентифікації клієнта.
     */
    #getClientIdentifier(clientWebSocket) {
        if (clientWebSocket.userId) {
            return `User ID: ${clientWebSocket.userId}`
        }

        if (clientWebSocket.username) {
            return `User: ${clientWebSocket.username}`
        }

        return `Unknown Client (readyState: ${clientWebSocket.readyState})`
    }

    /**
     * Створює нову кімнату, якщо її ще немає.
     * Якщо кімната вже існує, ця функція нічого не робить і повертає null.
     *
     * @param {string} roomName - Унікальна назва кімнати.
     * @param {function(string, Set<CustomWebSocket>): Promise<string | object | Buffer | ArrayBuffer>} [updateCallback=() => {}] - Асинхронна функція, яка повертає дані для оновлення клієнтів (рядок, об'єкт, або бінарні дані). Приймає `roomName` та `clients` як аргументи.
     * @param {number} [updateIntervalMs=0] - Інтервал (в мс) для періодичних оновлень. 0 вимикає оновлення.
     * @param {boolean} [runInitialUpdate=false] - Чи запускати `updateCallback` негайно при старті інтервалу.
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
     * Якщо кімната не існує, вона буде автоматично створена з наданими параметрами.
     * Запускає періодичні оновлення для кімнати, якщо це перший клієнт і налаштований інтервал > 0.
     * Відстежує приналежність клієнта до кімнат у `clientRoomMap`
     *
     * @param {string} roomName - Назва кімнати, до якої приєднати клієнта.
     * @param {WebSocket} clientWebSocket - Об'єкт WebSocket клієнта.
     * @param {function(string, Set<CustomWebSocket>): Promise<string | object | Buffer | ArrayBuffer>} [updateCallback=async () => null] - Асинхронна функція, яка повертає дані для оновлення клієнтів (рядок, об'єкт, або бінарні дані). Приймає `roomName` та `clients` як аргументи.
     * @param {number} [updateIntervalMs=0] - Інтервал оновлення (в мс) (використовується, якщо кімната створюється) > 0.
     * @param {boolean} [runInitialUpdate=false] - Чи запускати callback негайно (використовується, якщо кімната створюється).
     * @returns {boolean} - True, якщо клієнта додано, false, якщо кімната або клієнт не знайдено або клієнт вже в кімнаті.
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
                // Мало ймовірно, але для безпеки
                this.logger.error(`Не вдалося отримати або створити кімнату '${roomName}'.`)
                return false
            }
        }

        const clientIdentifier = this.#getClientIdentifier(clientWebSocket)

        // Перевіряємо, чи клієнт вже є в кімнаті, щоб уникнути дублікатів у Set
        if (room.clients.has(clientWebSocket)) {
            this.logger.debug(`Клієнт ${clientIdentifier} вже знаходиться в кімнаті '${roomName}'.`)
            return false
        }

        // Додаємо клієнта до кімнати
        room.clients.add(clientWebSocket)

        // ОНОВЛЮЄМО clientRoomMap: додаємо кімнату до списку кімнат клієнта
        if (!this.clientRoomsMap.has(clientWebSocket)) {
            this.clientRoomsMap.set(clientWebSocket, new Set())
        }
        this.clientRoomsMap.get(clientWebSocket).add(roomName)

        this.logger.debug(
            `Клієнт ${clientIdentifier} приєднався до кімнати '${roomName}'. Всього клієнтів: ${room.clients.size}`,
        )

        // Запускаємо оновлення, якщо це перший клієнт у кімнаті та налаштований інтервал
        if (room.clients.size === 1 && room.updateIntervalMs > 0) {
            this.#startRoomDataUpdates(
                roomName,
                room.updateCallback,
                room.updateIntervalMs,
                room.runInitialUpdate,
            )
        }

        // // Додаємо обробник події 'close' для автоматичного видалення клієнта
        // clientWebSocket.on('close', () => {
        //     this.leaveRoom(roomName, clientWebSocket)
        // })

        // ЗМІНЮЄМО ОБРОБНИК 'close':
        // Тепер обробник 'close' має викликати новий приватний метод
        // для повного видалення клієнта з усіх кімнат.
        // Додаємо обробник лише один раз при першому приєднанні клієнта.
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
     * Також видаляє запис з `clientRoomMap`.
     *
     * @param {string} roomName - Назва кімнати.
     * @param {WebSocket} clientWebSocket - Об'єкт WebSocket клієнта для видалення.
     * @returns {boolean} - True, якщо клієнта видалено, false, якщо кімната або клієнт не знайдено.
     */
    leaveRoom(roomName, clientWebSocket) {
        const clientIdentifier = this.#getClientIdentifier(clientWebSocket)

        const room = this.rooms.get(roomName)
        if (!room) {
            this.logger.warn(
                `Кімната '${roomName}' не знайдена при спробі видалення клієнта ${clientIdentifier}.`,
            )

            return false
        }

        if (room.clients.delete(clientWebSocket)) {
            this.logger.debug(
                `Клієнт ${clientIdentifier} покинув кімнату '${roomName}'. Залишилось клієнтів: ${room.clients.size}`,
            )

            // ОНОВЛЮЄМО clientRoomMap: видаляємо кімнату зі списку кімнат клієнта
            const clientRooms = this.clientRoomsMap.get(clientWebSocket)
            if (clientRooms) {
                clientRooms.delete(roomName)

                if (clientRooms.size === 0) {
                    this.clientRoomsMap.delete(clientWebSocket) // Якщо клієнт не входить до інших кімнат, видаляємо його з мапи
                    this.logger.debug(
                        `Клієнт ${clientIdentifier} повністю видалено з clientRoomMap.`,
                    )
                }
            }

            if (room.clients.size === 0) {
                this.#stopRoomDataUpdates(roomName) // Зупиняємо інтервал
                this.rooms.delete(roomName) // Видаляємо порожню кімнату
                this.logger.info(`Кімнату '${roomName}' видалено, оскільки вона порожня.`)
            }

            return true
        }

        this.logger.debug(`Клієнт ${clientIdentifier} не був знайдений у кімнаті '${roomName}'.`)

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
        let payloadToSend

        if (
            typeof message === 'object' &&
            message !== null && // Перевіряємо на null, оскільки typeof null === 'object'
            !Buffer.isBuffer(message) &&
            !(message instanceof ArrayBuffer)
        ) {
            // Якщо це об'єкт (але не бінарний буфер), серіалізуємо його в JSON рядок
            payloadToSend = JSON.stringify(message)
        } else {
            // Якщо це рядок, Buffer або ArrayBuffer - надсилаємо як є
            payloadToSend = message
        }

        return payloadToSend
    }

    /**
     * Надсилає повідомлення всім активним клієнтам у вказаній кімнаті. (broadcastToRoom)
     * Повідомлення може бути рядком, об'єктом (буде JSON.stringify) або бінарними даними (Buffer, ArrayBuffer).
     *
     * @param {string} roomName - Назва кімнати.
     * @param {string | object | Buffer | ArrayBuffer} message - Повідомлення для надсилання. Якщо об'єкт, буде серіалізовано в JSON.
     * @returns {number | null} Кількість клієнтів, яким було надіслано повідомлення, або `null`, якщо кімната не знайдена.
     */
    sendMessageToRoom(roomName, message) {
        const room = this.rooms.get(roomName)
        if (!room) {
            this.logger.warn(
                `Не вдалося надіслати повідомлення: кімната '${roomName}' не знайдена.`,
            )
            return null
        }

        // Визначаємо тип payload
        const payloadToSend = this.#prepareMessagePayload(message)
        //
        let sentCount = 0
        // Перетворення Set на масив для використання for...of для безпечної ітерації під час модифікації
        const clientsToProcess = Array.from(room.clients)

        clientsToProcess.forEach((clientWebSocket) => {
            const clientIdentifier = this.#getClientIdentifier(clientWebSocket)

            // Перевіряємо, чи з'єднання активне (OPEN = 1, WebSocket.OPEN)
            if (clientWebSocket.readyState === WebSocket.OPEN) {
                try {
                    clientWebSocket.send(payloadToSend)
                    sentCount++

                    // Для логування бінарних даних, можливо, захочеться вивести їх довжину, а не сам вміст
                    const logMessage =
                        Buffer.isBuffer(payloadToSend) || payloadToSend instanceof ArrayBuffer
                            ? `[Binary Data, ${
                                  payloadToSend.byteLength || payloadToSend.length
                              } bytes]`
                            : String(payloadToSend).substring(0, 50) +
                              (typeof payloadToSend === 'string' &&
                              String(payloadToSend).length > 50
                                  ? '...'
                                  : '')

                    this.logger.debug(
                        `Надіслано до '${roomName}': '${logMessage}' клієнту: ${clientIdentifier}`,
                    )
                } catch (error) {
                    this.logger.error(
                        `Помилка надсилання повідомлення клієнту: ${clientIdentifier} у кімнаті '${roomName}': ${error.message}`,
                        error,
                    )

                    room.clients.delete(clientWebSocket) // Видаляємо неактивного клієнта

                    // Якщо помилка надсилання, це може означати, що клієнт вже неактивний.
                    // Викликаємо глобальний метод для його видалення.
                    this.#removeClientGlobally(clientWebSocket)
                }
            } else {
                this.logger.warn(
                    `Клієнт: ${clientIdentifier} у кімнаті '${roomName}' неактивний (readyState: ${client.readyState}). Видалення клієнта.`,
                )

                room.clients.delete(clientWebSocket) // Видаляємо неактивного клієнта

                // Якщо помилка надсилання, це може означати, що клієнт вже неактивний.
                // Викликаємо глобальний метод для його видалення.
                this.#removeClientGlobally(clientWebSocket)
            }
        })

        // Якщо після надсилання повідомлень кімната стала порожньою через видалення неактивних клієнтів
        if (room.clients.size === 0) {
            this.#stopRoomDataUpdates(roomName) // Зупиняємо інтервал
            this.rooms.delete(roomName) // Видаляємо порожню кімнату
            this.logger.info(
                `Кімнату '${roomName}' видалено, оскільки вона порожня після чистки неактивних клієнтів.`,
            )
        }

        return sentCount
    }

    /**
     * Приватний метод для повного видалення клієнта з усіх кімнат, до яких він належить.
     * Викликається при закритті WebSocket з'єднання клієнта або виявленні його неактивності.
     * @private
     * @param {CustomWebSocket} clientWebSocket - Об'єкт WebSocket клієнта для видалення.
     * @returns {void}
     */
    #removeClientGlobally(clientWebSocket) {
        const clientIdentifier = this.#getClientIdentifier(clientWebSocket)

        this.logger.info(`Починаємо глобальне видалення клієнта: ${clientIdentifier}.`)

        const roomsOfClient = this.clientRoomsMap.get(clientWebSocket)

        if (roomsOfClient) {
            // Створюємо копію Set, щоб уникнути проблем під час ітерації та модифікації
            // (оскільки leaveRoom модифікує clientRoomMap)
            const roomsToLeave = new Set(roomsOfClient)

            roomsToLeave.forEach((roomName) => {
                this.leaveRoom(roomName, clientWebSocket)
            })
        } else {
            this.logger.debug(
                `Клієнт ${clientIdentifier} не знайдений у clientRoomMap. Можливо, вже видалено.`,
            )
        }

        // Переконаємося, що клієнт видалений з clientRoomMap, якщо він чомусь там залишився
        this.clientRoomsMap.delete(clientWebSocket)

        // Також очисчаємо флаг обробника close, якщо об'єкт ws буде перевикористаний
        if (clientWebSocket.__closeHandlerRegistered) {
            delete clientWebSocket.__closeHandlerRegistered
        }

        this.logger.info(`Глобальне видалення клієнта ${clientIdentifier} завершено.`)
    }

    /**
     * Приватний метод для запуску періодичного надсилання даних клієнтам кімнати.
     * Цей метод викликається, коли перший клієнт приєднується до кімнати, якщо `updateIntervalMs` > 0.
     * @private
     * @param {string} roomName - Назва кімнати.
     * @param {function(string, Set<CustomWebSocket>): Promise<string | object | Buffer | ArrayBuffer>} [updateCallback=async () => null] - Асинхронна функція для отримання даних для оновлення, яка повертає дані (рядок, об'єкт, або бінарні дані).
     * @param {number} [updateIntervalMs=0] - Інтервал оновлення у мілісекундах.
     * @param {boolean} [runInitialUpdate=false] - Чи запускати callback при першому старті інтервалу (негайно).
     * @returns {null} Завжди повертає `null`.
     */
    #startRoomDataUpdates(
        roomName,
        updateCallback = async () => null,
        updateIntervalMs = 0,
        runInitialUpdate = false,
    ) {
        const room = this.rooms.get(roomName)
        if (!room || room.intervalId) {
            this.logger.debug(
                `Інтервал для кімнати '${roomName}' вже запущений або кімната не існує.`,
            )
            return null
        }

        // Функція
        const sendUpdates = async () => {
            try {
                if (room.clients.size === 0) {
                    // Якщо клієнтів більше немає, зупиняємо інтервал
                    this.#stopRoomDataUpdates(roomName)
                    this.logger.info(
                        `Інтервал для кімнати '${roomName}' зупинено, бо кімната порожня.`,
                    )
                    return null
                }

                const data = await updateCallback(roomName, room.clients)
                // Перевикористовуємо sendMessageToRoom для надсилання даних
                const sentCount = this.sendMessageToRoom(roomName, data)

                if (sentCount !== null && sentCount === 0 && room.clients.size > 0) {
                    this.logger.debug(
                        `sendMessageToRoom не надіслала жодного повідомлення, хоча клієнти є в кімнаті '${roomName}' їх: ${room.clients.size}`,
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

        return null
    }

    /**
     * Приватний метод для зупинки періодичного надсилання даних кімнати.
     * Викликається, коли всі клієнти покидають кімнату.
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

    /**
     * Надсилає повідомлення всім активним клієнтам, підключеним до менеджера кімнат, незалежно від їхньої кімнати.
     * Ітеруємо по `this.clientRoomsMap` для ефективнішої розсилки та активного видалення неактивних клієнтів.
     *
     * @param {string | object | Buffer | ArrayBuffer} message - Повідомлення для надсилання. Якщо об'єкт, буде серіалізовано в JSON.
     * @returns {number} Кількість клієнтів, яким було надіслано повідомлення.
     */
    broadcastToAllClients(message) {
        // Визначаємо тип payload
        const payloadToSend = this.#prepareMessagePayload(message)

        let sentCount = 0
        // Ітеруємо по копії ключей, щоб уникнути проблем під час модифікації clientRoomMap у циклі
        const clientsToProcess = Array.from(this.clientRoomsMap.keys())

        for (const clientWebSocket of clientsToProcess) {
            const clientIdentifier = this.#getClientIdentifier(clientWebSocket)

            // Перевіряємо, чи з'єднання активне (OPEN = 1,  WebSocket.OPEN)
            if (clientWebSocket.readyState === WebSocket.OPEN) {
                try {
                    clientWebSocket.send(payloadToSend)
                    sentCount++

                    const logMessage =
                        Buffer.isBuffer(payloadToSend) || payloadToSend instanceof ArrayBuffer
                            ? `[Binary Data, ${
                                  payloadToSend.byteLength || payloadToSend.length
                              } bytes]`
                            : String(payloadToSend).substring(0, 50) +
                              (typeof payloadToSend === 'string' &&
                              String(payloadToSend).length > 50
                                  ? '...'
                                  : '')

                    this.logger.debug(
                        `Глобальна розсилка: '${logMessage}' клієнту: ${clientIdentifier}.`,
                    )
                } catch (error) {
                    this.logger.error(
                        `Помилка глобальної розсилки клієнту ${clientIdentifier}: ${error.message}`,
                        error,
                    )

                    // Якщо помилка надсилання, це може означати, що клієнт вже неактивний.
                    // Викликаємо глобальний метод для його видалення.
                    this.#removeClientGlobally(clientWebSocket)
                }
            } else {
                this.logger.warn(
                    `Клієнт ${clientIdentifier} неактивний (readyState: ${clientWebSocket.readyState}) під час глобальної розсилки. Видалення.`,
                )

                // Якщо помилка надсилання, це може означати, що клієнт вже неактивний.
                // Викликаємо глобальний метод для його видалення.
                this.#removeClientGlobally(clientWebSocket)
            }
        }

        return sentCount
    }

    /**
     * Надсилає повідомлення конкретному клієнту за його ідентифікатором (userId або id).
     * Цей метод шукає клієнта у всіх кімнатах або в clientRoomsMap.
     *
     * @param {string} clientId - Унікальний ідентифікатор клієнта (userId або id).
     * @param {string | object | Buffer | ArrayBuffer} message - Повідомлення для надсилання. Якщо об'єкт, буде серіалізовано в JSON.
     * @returns {boolean} - True, якщо повідомлення надіслано, false, якщо клієнта не знайдено або виникла помилка.
     */
    sendMessageToClient(clientId, message) {
        let targetClient = null

        // Шукаємо клієнта за clientId у clientRoomsMap
        // Перебираємо всі зареєстровані WebSocket об'єкти
        for (const clientWebSocket of this.clientRoomsMap.keys()) {
            if (clientWebSocket.userId === clientId || clientWebSocket.id === clientId) {
                targetClient = clientWebSocket
                break
            }
        }

        if (!targetClient) {
            this.logger.warn(`Клієнт з ідентифікатором '${clientId}' не знайдений.`)
            return false
        }

        const clientIdentifier = this.#getClientIdentifier(targetClient)
        const payloadToSend = this.#prepareMessagePayload(message)

        if (targetClient.readyState === WebSocket.OPEN) {
            try {
                targetClient.send(payloadToSend)

                const logMessage =
                    Buffer.isBuffer(payloadToSend) || payloadToSend instanceof ArrayBuffer
                        ? `[Binary Data, ${payloadToSend.byteLength || payloadToSend.length} bytes]`
                        : String(payloadToSend).substring(0, 50) +
                          (typeof payloadToSend === 'string' && String(payloadToSend).length > 50
                              ? '...'
                              : '')

                this.logger.debug(
                    `Надіслано приватне повідомлення клієнту '${clientIdentifier}': '${logMessage}'.`,
                )
                return true
            } catch (error) {
                this.logger.error(
                    `Помилка надсилання приватного повідомлення клієнту ${clientIdentifier}: ${error.message}`,
                    error,
                )
                // Якщо виникла помилка, це може означати, що з'єднання вже неактивне.
                // Глобально видаляємо клієнта.
                this.#removeClientGlobally(targetClient)
                return false
            }
        } else {
            this.logger.warn(
                `Клієнт ${clientIdentifier} неактивний (readyState: ${targetClient.readyState}). Повідомлення не надіслано.`,
            )
            this.#removeClientGlobally(targetClient) // Видаляємо неактивного клієнта
            return false
        }
    }

    /**
     * Повертає кількість клієнтів у кімнаті.
     *
     * @param {string} roomName - Назва кімнати.
     * @returns {number} - Кількість клієнтів або 0, якщо кімната не існує.
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
     * @returns {{ clients: Set<WebSocket>, intervalId: NodeJS.Timeout | null, updateCallback: Function | null, updateIntervalMs: number, runInitialUpdate: boolean } | undefined} - Об'єкт конфігурації кімнати або `undefined`, якщо кімната не знайдена.
     */
    getRoom(roomName) {
        return this.rooms.get(roomName)
    }
}

// Експортуємо клас за замовчуванням
export default RoomsManager
