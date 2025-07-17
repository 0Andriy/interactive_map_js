// client.js

import { v4 as uuidv4 } from 'uuid' // Для генерації унікальних ID з'єднань

/**
 * Клас, що представляє одне активне WebSocket-з'єднання.
 * Один користувач може мати багато екземплярів ConnectedClient.
 */
class ConnectedClient {
    /**
     * @param {WebSocket} ws - Екземпляр WebSocket з'єднання.
     * @param {object} logger - Об'єкт логера з методами info, warn, error, debug.
     * @param {string | null} [userId=null] - Унікальний ідентифікатор користувача. Може бути null, якщо користувач ще не автентифікований.
     */
    constructor(ws, logger, userId = null) {
        /**
         * Унікальний ідентифікатор для цього конкретного WebSocket-з'єднання.
         * Це відрізняє одне з'єднання від іншого, навіть якщо вони належать одному користувачу.
         * @type {string}
         */
        this.connectionId = uuidv4()

        /**
         * Зберігаємо екземпляр WebSocket для надсилання/отримання повідомлень.
         * Можна додати властивості до сирого обєкта ws для легкого доступу
         * @type {WebSocket}
         */
        this.ws = ws

        /**
         * Об'єкт логера, що дозволяє логувати події з різними рівнями.
         * @type {object}
         */
        this.logger = logger

        /**
         * ID користувача, до якого належить це з'єднання.
         * Буде встановлено після автентифікації.
         * @type {string | null}
         */
        this.userId = userId

        /**
         * Прапорець, що вказує, чи користувач автентифікований для цього з'єднання.
         * @type {boolean}
         */
        this.isAuthenticated = false

        /**
         * Set кімнат, до яких належить це з'єднання.
         * Set забезпечує унікальність і швидкий пошук.
         * @type {Set<string>}
         */
        this.rooms = new Set()

        /**
         * Час встановлення з'єднання.
         * @type {Date}
         */
        this.joinedAt = new Date()

        this.logger.info(`[ConnectedClient:${this.connectionId}] Initialized.`, {
            connectionId: this.connectionId,
            userId: this.userId, // Може бути null на початку
        })
    }

    /**
     * Повертає базовий WebSocket екземпляр.
     * @returns {WebSocket}
     */
    get ws() {
        return this.ws
    }

    /**
     * Повертає унікальний ідентифікатор з'єднання.
     * @returns {string}
     */
    get connectionId() {
        return this.connectionId
    }

    /**
     * Повертає ідентифікатор користувача, якщо він автентифікований.
     * @returns {string | null}
     */
    get userId() {
        return this.userId
    }

    /**
     * Встановлює ідентифікатор користувача після успішної автентифікації.
     * @param {string} id - ID користувача.
     */
    setUserId(id) {
        this.userId = id
        this.logger.info(`Client ${this.connectionId} authenticated as userId: ${this.userId}`)
    }

    /**
     * Повертає Set з повними назвами кімнат, до яких приєднаний цей клієнт.
     * @returns {Set<string>}
     */
    get rooms() {
        return this.rooms
    }

    /**
     * Додає з'єднання до кімнати.
     * @param {string} roomName - Назва кімнати.
     */
    joinRoom(roomName) {
        if (this.rooms.has(roomName)) {
            this.logger.debug(
                `[ConnectedClient:${this.connectionId}] Already in room: ${roomName}.`,
                {
                    connectionId: this.connectionId,
                    roomName: roomName,
                },
            )
            return
        }
        this.rooms.add(roomName)
        this.logger.info(`[ConnectedClient:${this.connectionId}] Joined room: ${roomName}`, {
            connectionId: this.connectionId,
            roomName: roomName,
            currentRooms: Array.from(this.rooms),
        })
    }

    /**
     * Видаляє з'єднання з кімнати.
     * @param {string} roomName - Назва кімнати.
     */
    leaveRoom(roomName) {
        if (this.rooms.delete(roomName)) {
            this.logger.info(`[ConnectedClient:${this.connectionId}] Left room: ${roomName}`, {
                connectionId: this.connectionId,
                roomName: roomName,
                currentRooms: Array.from(this.rooms),
            })
        } else {
            this.logger.warn(
                `[ConnectedClient:${this.connectionId}] Attempted to leave non-existent room: ${roomName}`,
                {
                    connectionId: this.connectionId,
                    roomName: roomName,
                },
            )
        }
    }

    /**
     * Перевіряє, чи належить з'єднання до певної кімнати.
     * @param {string} roomName - Назва кімнати.
     * @returns {boolean}
     */
    isInRoom(roomName) {
        return this.rooms.has(roomName)
    }

    /**
     * Надсилає повідомлення цьому конкретному клієнту.
     * Перевіряє стан WebSocket перед надсиланням та обробляє потенційні помилки.
     * @param {string | object} message - Повідомлення для надсилання (може бути об'єктом, який буде JSON.stringify).
     * @param {object} [options={}] - Додаткові опції для надсилання, що передаються в ws.send() (наприклад, { binary: true }).
     */
    send(message, options = {}) {
        if (this.ws.readyState === this.ws.OPEN) {
            try {
                const dataToSend = typeof message === 'object' ? JSON.stringify(message) : message
                this.ws.send(dataToSend, options, (err) => {
                    if (err) {
                        // Цей колбек обробляє помилки, які можуть виникнути асинхронно
                        this.logger.error(
                            `[ConnectedClient:${this.connectionId}] Asynchronous send error: ${err.message}`,
                            {
                                connectionId: this.connectionId,
                                error: err.message,
                                message: message,
                                options: options,
                            },
                        )
                    }
                })
                this.logger.debug(`[ConnectedClient:${this.connectionId}] Message sent.`, {
                    connectionId: this.connectionId,
                    messageType: typeof message,
                    messageSize: typeof dataToSend === 'string' ? dataToSend.length : 'N/A', // Додаємо розмір повідомлення
                    options: options,
                    userId: this.userId, // Додаємо userId для контексту логування
                })
            } catch (error) {
                // Цей блок обробляє синхронні помилки (наприклад, JSON.stringify помилки)
                this.logger.error(
                    `[ConnectedClient:${this.connectionId}] Synchronous send error: ${error.message}`,
                    {
                        connectionId: this.connectionId,
                        error: error.message,
                        message: message,
                        options: options,
                    },
                )
            }
        } else {
            this.logger.warn(
                `[ConnectedClient:${this.connectionId}] Attempted to send message to closed or closing WebSocket. State: ${this.ws.readyState}`,
                {
                    connectionId: this.connectionId,
                    wsReadyState: this.ws.readyState,
                    userId: this.userId,
                    message: message, // Включимо повідомлення для контексту
                },
            )
        }
    }

    /**
     * Встановлює ID користувача після автентифікації.
     * @param {string} userId - Унікальний ідентифікатор користувача.
     */
    authenticate(userId) {
        if (this.isAuthenticated && this.userId === userId) {
            this.logger.debug(
                `[ConnectedClient:${this.connectionId}] Already authenticated as ${userId}. No change needed.`,
                { connectionId: this.connectionId, userId: userId },
            )
            return
        }
        if (this.isAuthenticated && this.userId !== userId) {
            this.logger.warn(
                `[ConnectedClient:${this.connectionId}] Re-authenticating connection from ${this.userId} to ${userId}. This might indicate a logic error or re-login.`,
                {
                    connectionId: this.connectionId,
                    oldUserId: this.userId,
                    newUserId: userId,
                },
            )
        }
        this.userId = userId
        this.isAuthenticated = true
        this.logger.info(
            `[ConnectedClient:${this.connectionId}] Authenticated as userId: ${this.userId}`,
            {
                connectionId: this.connectionId,
                userId: this.userId,
            },
        )
    }
}

export default ConnectedClient
