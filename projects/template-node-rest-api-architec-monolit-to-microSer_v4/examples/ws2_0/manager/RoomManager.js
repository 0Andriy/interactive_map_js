//
class RoomManager {
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
        this.logger = logger
    }

    /**
     * Створює нову кімнату, якщо її ще немає.
     * Якщо кімната вже існує, ця функція нічого не робить.
     *
     * @param {string} roomName - Унікальна назва кімнати.
     * @param {Function} [updateCallback=() => {}] - Асинхронна функція, яка повертає дані для оновлення клієнтів (рядок, об'єкт, або бінарні дані).
     * @param {number} [updateIntervalMs=0] - Інтервал (в мс) для періодичних оновлень. 0 вимикає оновлення.
     * @param {boolean} [runInitialUpdate=false] - Чи потрібно викликати `updateCallback` негайно при старті інтервалу.
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

        this.rooms.set(roomName, {
            clients: new Set(),
            intervalId: null,
            updateCallback: updateCallback,
            updateIntervalMs: updateIntervalMs,
            runInitialUpdate: runInitialUpdate,
        })
        this.logger.info(`Кімнату '${roomName}' створено.`)
    }

    /**
     * Додає клієнта до вказаної кімнати.
     * Якщо кімната не існує, вона буде автоматично створена з наданими параметрами.
     * Запускає періодичні оновлення для кімнати, якщо це перший клієнт і налаштований інтервал.
     *
     * @param {string} roomName - Назва кімнати, до якої приєднати клієнта.
     * @param {WebSocket} clientWebSocket - Об'єкт WebSocket клієнта.
     * @param {Function} [updateCallback=async () => null] - Функція для отримання даних для оновлення (використовується, якщо кімната створюється).
     * @param {number} [updateIntervalMs=0] - Інтервал оновлення (в мс) (використовується, якщо кімната створюється).
     * @param {boolean} [runInitialUpdate=false] - Чи запускати callback негайно (використовується, якщо кімната створюється).
     * @returns {boolean} - True, якщо клієнта додано, false, якщо виникла помилка (наприклад, недійсний клієнт).
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
            room = this.rooms.get(roomName) // Отримуємо новостворену кімнату
            if (!room) {
                // Мало ймовірно, але для безпеки
                this.logger.error(`Не вдалося отримати або створити кімнату '${roomName}'.`)
                return false
            }
        }

        // Перевіряємо, чи клієнт вже є в кімнаті, щоб уникнути дублікатів у Set
        if (room.clients.has(clientWebSocket)) {
            this.logger.debug(
                `Клієнт ${clientWebSocket.id || ''} вже знаходиться в кімнаті '${roomName}'.`,
            )
            return false
        }

        room.clients.add(clientWebSocket)
        this.logger.debug(
            `Клієнт ${
                clientWebSocket.id || ''
            } приєднався до кімнати '${roomName}'. Всього клієнтів: ${room.clients.size}`,
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

        // Додаємо обробник події 'close' для автоматичного видалення клієнта
        clientWebSocket.on('close', () => {
            this.leaveRoom(roomName, clientWebSocket)
        })

        return true
    }

    /**
     * Видаляє клієнта з кімнати.
     * Якщо кімната стає порожньою, її інтервал оновлення зупиняється і кімната видаляється.
     *
     * @param {string} roomName - Назва кімнати.
     * @param {WebSocket} clientWebSocket - Об'єкт WebSocket клієнта для видалення.
     * @returns {boolean} - True, якщо клієнта видалено, false, якщо кімната або клієнт не знайдено.
     */
    leaveRoom(roomName, clientWebSocket) {
        const room = this.rooms.get(roomName)
        if (!room) {
            this.logger.warn(
                `Кімната '${roomName}' не знайдена при спробі видалення клієнта ${
                    clientWebSocket.id || ''
                }.`,
            )
            return false
        }

        if (room.clients.delete(clientWebSocket)) {
            this.logger.debug(
                `Клієнт ${
                    clientWebSocket.id || ''
                } покинув кімнату '${roomName}'. Залишилось клієнтів: ${room.clients.size}`,
            )

            if (room.clients.size === 0) {
                this.#stopRoomDataUpdates(roomName) // Зупиняємо інтервал
                this.rooms.delete(roomName) // Видаляємо порожню кімнату
                this.logger.info(`Кімнату '${roomName}' видалено, оскільки вона порожня.`)
            }
            return true
        }

        this.logger.debug(
            `Клієнт ${clientWebSocket.id || ''} не був знайдений у кімнаті '${roomName}'.`,
        )
        return false
    }

    /**
     * Надсилає повідомлення всім активним клієнтам у вказаній кімнаті.
     * Повідомлення може бути рядком, об'єктом (буде JSON.stringify) або бінарними даними (Buffer, ArrayBuffer).
     *
     * @param {string} roomName - Назва кімнати.
     * @param {string | object | Buffer | ArrayBuffer} message - Повідомлення для надсилання.
     */
    sendMessageToRoom(roomName, message) {
        const room = this.rooms.get(roomName)
        if (!room) {
            this.logger.warn(
                `Не вдалося надіслати повідомлення: кімната '${roomName}' не знайдена.`,
            )
            return null
        }

        let payloadToSend
        // Визначаємо тип payload
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

        let sentCount = 0
        room.clients.forEach((client) => {
            // Перевіряємо, чи з'єднання активне (OPEN = 1)
            if (client.readyState === 1) {
                // WebSocket.OPEN
                client.send(payloadToSend)
                sentCount++
                // Для логування бінарних даних, можливо, вам захочеться вивести їх довжину, а не сам вміст
                const logMessage =
                    Buffer.isBuffer(payloadToSend) || payloadToSend instanceof ArrayBuffer
                        ? `[Binary Data, ${payloadToSend.byteLength || payloadToSend.length} bytes]`
                        : payloadToSend.substring(0, 50) +
                          (typeof payloadToSend === 'string' && payloadToSend.length > 50
                              ? '...'
                              : '')

                this.logger.debug(
                    `Надіслано до '${roomName}': '${logMessage}' клієнту: ${client.id || ''}`,
                )
            } else {
                this.logger.warn(
                    `Клієнт ${client.id || ''} у кімнаті '${roomName}' неактивний (readyState: ${
                        client.readyState
                    }). Видалення клієнта.`,
                )
                room.clients.delete(client) // Видаляємо неактивного клієнта
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
     * Повертає об'єкт кімнати за назвою.
     * Може бути корисним для розширених операцій або перевірок.
     *
     * @param {string} roomName - Назва кімнати.
     * @returns {{ clients: Set<WebSocket>, intervalId: NodeJS.Timeout | null, updateCallback: Function | null, updateIntervalMs: number, runInitialUpdate: boolean } | undefined}
     */
    getRoom(roomName) {
        return this.rooms.get(roomName)
    }

    /**
     * Приватний метод для запуску періодичного надсилання даних клієнтам кімнати.
     * @private
     * @param {string} roomName - Назва кімнати.
     * @param {Function} [updateCallback=async () => null] - Асинхронна функція для отримання даних для оновлення, яка повертає дані (рядок, об'єкт, або бінарні дані).
     * @param {number} [updateIntervalMs=0] - Інтервал оновлення у мілісекундах.
     * @param {boolean} [runInitialUpdate=false] - Чи запускати callback при першому старті інтервалу (негайно).
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
}

//
export default RoomManager
