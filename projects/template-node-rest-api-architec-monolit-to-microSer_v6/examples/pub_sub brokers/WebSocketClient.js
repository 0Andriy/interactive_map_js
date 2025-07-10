// src/WebSocketClient.js
import { Room } from './namespaces/index.js' // Імпортуємо Room

/**
 * @typedef {function(any, string): void} RoomMessageCallback
 */

/**
 * @class WebSocketClient
 * @description Представляє одне WebSocket-з'єднання з розширеними властивостями користувача.
 */
class WebSocketClient {
    /**
     * @param {WebSocket} ws - Об'єкт WebSocket-з'єднання.
     * @param {object} logger - Екземпляр логера.
     * @param {string} [id] - Унікальний ID для цього підключення.
     * @param {string} [userId] - Унікальний ID користувача (може бути спільним для кількох підключень).
     * @param {string} [username] - Ім'я користувача.
     */
    constructor(ws, logger, id, userId, username) {
        /**
         * @public
         * @type {string}
         * @description Унікальний ID для цього конкретного WebSocket-з'єднання.
         */
        this.id =
            id ||
            (typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`)

        /**
         * @public
         * @type {string}
         * @description Унікальний ID користувача. Може бути однаковим для кількох WebSocket-з'єднань
         * (наприклад, якщо один користувач відкрив кілька вкладок браузера).
         */
        this.userId = userId || this.id // Якщо userId не надано, використовуємо ID підключення за замовчуванням

        /**
         * @public
         * @type {string}
         * @description Ім'я користувача, що відображається.
         */
        this.username = username || `Guest_${this.id.toString().substring(7, 12)}`

        /**
         * @public
         * @type {WebSocket}
         * @description Об'єкт WebSocket-з'єднання.
         */
        this.ws = ws

        /**
         * @private
         * @type {object}
         * @description Логер для цього клієнта.
         */
        this.logger = logger

        /**
         * @public
         * @type {Date}
         * @description Час підключення клієнта.
         */
        this.connectedAt = new Date()

        /**
         * @private
         * @type {Map<string, Room>}
         * @description Мапа кімнат, до яких підключений клієнт. Ключ: повне ім'я кімнати (наприклад, 'chat/general').
         */
        this.joinedRooms = new Map()

        /**
         * @private
         * @type {Map<string, RoomMessageCallback>}
         * @description Мапа колбеків для кожної кімнати. Ключ: повне ім'я кімнати.
         */
        this.roomCallbacks = new Map()

        this.logger.debug(
            `WebSocketClient ${this.id} (${this.username}/${this.userId}) initialized.`,
        )
    }

    /**
     * @method joinRoom
     * @description Додає клієнта до вказаної кімнати.
     * @param {Room} room - Екземпляр кімнати.
     * @param {RoomMessageCallback} callback - Колбек для отримання повідомлень з кімнати.
     * @returns {Promise<void>}
     */
    async joinRoom(room, callback) {
        const roomIdentifier = `${room.namespace.name}/${room.name}`
        if (this.joinedRooms.has(roomIdentifier)) {
            this.logger.warn(
                `Client ${this.id} (${this.username}) is already in room '${roomIdentifier}'.`,
            )
            return
        }

        // Передаємо userId як "член" кімнати, щоб інші інстанси бачили його
        await room.join(this.userId, callback)
        this.joinedRooms.set(roomIdentifier, room)
        this.roomCallbacks.set(roomIdentifier, callback)
        this.logger.info(`Client ${this.id} (${this.username}) joined room '${roomIdentifier}'.`)
    }

    /**
     * @method leaveRoom
     * @description Видаляє клієнта з вказаної кімнати.
     * @param {Room} room - Екземпляр кімнати.
     * @returns {Promise<void>}
     */
    async leaveRoom(room) {
        const roomIdentifier = `${room.namespace.name}/${room.name}`
        if (!this.joinedRooms.has(roomIdentifier)) {
            this.logger.warn(
                `Client ${this.id} (${this.username}) is not in room '${roomIdentifier}'.`,
            )
            return
        }

        await room.leave(this.userId)
        this.joinedRooms.delete(roomIdentifier)
        this.roomCallbacks.delete(roomIdentifier)
        this.logger.info(`Client ${this.id} (${this.username}) left room '${roomIdentifier}'.`)
    }

    /**
     * @method sendToClient
     * @description Надсилає повідомлення безпосередньо цьому WebSocket-клієнту.
     * @param {object} message - Об'єкт повідомлення для надсилання.
     */
    sendToClient(message) {
        if (this.ws.readyState === this.ws.OPEN) {
            this.ws.send(JSON.stringify(message))
        } else {
            this.logger.warn(`Attempted to send message to closed WebSocket for client ${this.id}.`)
        }
    }

    /**
     * @method cleanup
     * @description Виконує очистку ресурсів при відключенні клієнта.
     * @returns {Promise<void>}
     */
    async cleanup() {
        this.logger.debug(`Cleaning up client ${this.id} (${this.username}).`)
        for (const [roomIdentifier, room] of this.joinedRooms.entries()) {
            try {
                // Повідомляємо кімнату, що користувач покинув її
                await room.publish(
                    {
                        type: 'status',
                        content: `User ${this.username} (${this.userId}) disconnected.`,
                    },
                    'system',
                )
                await room.leave(this.userId) // Видаляємо userId з членів кімнати
                this.logger.debug(
                    `Client ${this.id} removed from room '${roomIdentifier}' during cleanup.`,
                )
            } catch (error) {
                this.logger.error(
                    `Error during cleanup for client ${this.id} in room ${roomIdentifier}:`,
                    error,
                )
            }
        }
        this.joinedRooms.clear()
        this.roomCallbacks.clear()
        this.ws.close() // Забезпечуємо закриття сокету
        this.logger.info(`Client ${this.id} cleanup complete.`)
    }
}

export default WebSocketClient
