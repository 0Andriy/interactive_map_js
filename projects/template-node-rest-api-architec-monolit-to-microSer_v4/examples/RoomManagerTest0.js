//
class RoomManager {
    constructor(logger = console) {
        this.rooms = new Map() // roomName => { clients: Set, intervalId }
        this.logger = logger
    }

    /**
     * Створює нову кімнату, якщо її ще немає.
     * @param {string} roomName Назва кімнати.
     */
    createRoom(roomName, callbackFn = () => {}, intervalMs = 0, runCallbackFnInStart = false) {
        if (!this.rooms.has(roomName)) {
            this.rooms.set(roomName, {
                clients: new Set(),
                intervalId: null, // Спочатку немає активного інтервалу
                callbackFn: callbackFn,
                intervalMs: intervalMs,
                runCallbackFnInStart: runCallbackFnInStart,
            })
            this.logger.info(`Кімнату '${roomName}' створено.`)
        }
    }

    /**
     * Додає клієнта до кімнати.
     * @param {string} roomName Назва кімнати.
     * @param {any} clientWs Клієнтський об'єкт (наприклад, WebSocket).
     * @returns {boolean} True, якщо клієнта додано, false, якщо кімнати не існує.
     */
    joinRoom(
        roomName,
        clientWs,
        callbackFn = () => {},
        intervalMs = 0,
        runCallbackFnInStart = false,
    ) {
        //
        const room = this.rooms.get(roomName)
        if (!room) {
            // Перевірка на існування створеної кімнати
            this.createRoom(roomName, callbackFn, intervalMs, runCallbackFnInStart)
        }

        //
        room.clients.add(clientWs)
        this.logger.debug(
            `Клієнт приєднався до кімнати '${roomName}'. Всього клієнтів: ${room.clients.size}`,
        )

        //
        if (!room.intervalId && room.intervalMs && room.intervalMs > 0) {
            async function getData() {
                try {
                    // Якщо нема користувачів нічого не робимо
                    if (room.client.size === 0) return null

                    //
                    const data = await room.callbackFn()
                    const payload = JSON.stringify({ type: 'update', data })

                    //
                    for (const client of room.clients) {
                        if (client.readyState === 1) client.send(payload)
                    }
                } catch (error) {
                    this.logger.error(`[Room:${roomName}] fetch error: ${error.message}`, error)
                }
            }

            //
            if (room.runCallbackFnInStart) {
                getData()
            }

            //
            room.intervalId = setInterval(getData, room.intervalMs)
        }

        //
        clientWs.on('close', () => {
            this.leaveRoom(roomName, clientWs)
        })

        return true
    }

    /**
     * Видаляє клієнта з кімнати.
     * @param {string} roomName Назва кімнати.
     * @param {any} clientWs Клієнтський об'єкт.
     */
    leaveRoom(roomName, clientWs) {
        const room = this.rooms.get(roomName)
        if (!room) return null

        //
        if (room.clients.has(clientWs)) {
            room.clients.delete(clientWs)
            this.logger.debug(
                `Клієнт покинув кімнату '${roomName}'. Залишилось клієнтів: ${room.clients.size}`,
            )
        }

        //
        if (room.clients.size === 0 && room.intervalId) {
            //
            clearInterval(room.intervalId)
            room.intervalId = null
            //
            this.clearRoomInterval(roomName) // Очищаємо інтервал, якщо кімната порожня
            // Видаляємо порожню кімнату
            this.rooms.delete(roomName)
            this.logger.debug(`Кімнату '${roomName}' видалено, оскільки вона порожня.`)
        }
    }

    /**
     * Надсилає повідомлення всім клієнтам у кімнаті.
     * @param {string} roomName Назва кімнати.
     * @param {string} message Повідомлення для надсилання.
     */
    sendMessageToRoom(roomName, message) {
        const room = this.rooms.get(roomName)
        if (!room) {
            this.logger.warn(
                `Не вдалося надіслати повідомлення: кімната '${roomName}' не знайдена.`,
            )
            return null
        }

        room.clients.forEach((client) => {
            client.send(message)
            logger.debug(`Надіслано до '${roomName}': '${message}' клієнту: ${client.id || client}`)
        })
    }

    /**
     * Запускає або зупиняє періодичний процес для кімнати.
     * @param {string} roomName Назва кімнати.
     * @param {number} delay Затримка інтервалу в мс.
     * @param {Function} callback Функція, яка буде викликатись.
     */
    startRoomInterval(roomName, delay, callback) {
        const room = this.rooms.get(roomName)
        if (room) {
            this.clearRoomInterval(roomName) // Спочатку очищаємо будь-який існуючий інтервал
            room.intervalId = setInterval(() => {
                logger.log(`Виконання інтервалу для кімнати '${roomName}'`)
                callback(roomName, room.clients)
            }, delay)
            logger.log(`Інтервал для кімнати '${roomName}' запущено.`)
        }
    }

    /**
     * Очищає інтервал для кімнати.
     * @param {string} roomName Назва кімнати.
     */
    clearRoomInterval(roomName) {
        const room = this.rooms.get(roomName)
        if (room && room.intervalId) {
            clearInterval(room.intervalId)
            room.intervalId = null
            logger.log(`Інтервал для кімнати '${roomName}' очищено.`)
        }
    }

    /**
     * Повертає кількість клієнтів у кімнаті.
     * @param {string} roomName Назва кімнати.
     * @returns {number} Кількість клієнтів або 0, якщо кімната не існує.
     */
    getClientCount(roomName) {
        const room = this.rooms.get(roomName)
        return room ? room.clients.size : 0
    }
}
