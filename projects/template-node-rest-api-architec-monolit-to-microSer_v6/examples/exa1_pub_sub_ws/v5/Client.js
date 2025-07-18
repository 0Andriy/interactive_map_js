// Client.js

import { v4 as uuidv4 } from 'uuid' // Для генерації унікальних ID з'єднань

/**
 * Клас, що представляє одне активне WebSocket-з'єднання.
 * Один користувач може мати багато екземплярів ConnectedClient.
 */
class ConnectedClient {
    /**
     * @private
     * Унікальний ідентифікатор з'єднання.
     * @type {string}
     */
    #connectionId

    /**
     * @private
     * Об'єкт WS підключення WebSocket
     * @type {WebSocket}
     */
    #ws

    /**
     * @private
     * Об'єкт логера.
     * @type {object}
     */
    #logger

    /**
     * @private
     * Об'єкт, що містить інформацію про користувача (наприклад, userId, username, roles).
     * За замовчуванням порожній об'єкт, може бути заповнений після автентифікації.
     * @type {object}
     */
    #user = {}

    /**
     * @private
     * @type {Namespace | null}
     */
    #namespace = null

    /**
     * @private
     * Set з повними назвами кімнат, до яких приєднаний цей клієнт (наприклад, 'chat/general').
     * @type {Set<string>}
     */
    #rooms

    /**
     * @type {boolean}
     * Прапорець, що вказує, чи користувач автентифікований для цього з'єднання.
     */
    isAuthenticated = false

    /**
     * @type {Date}
     * Час встановлення з'єднання.
     */
    joinedAt

    /**
     * @param {WebSocket} ws - Екземпляр WebSocket з'єднання.
     * @param {object} logger - Об'єкт логера з методами info, warn, error, debug.
     * @param {object | null} [initialUserData=null] - Початкові дані користувача. Може бути null, якщо користувач ще не автентифікований.
     * Очікується об'єкт з ключем 'userId'.
     */
    constructor(ws, logger, initialUserData = null) {
        if (!(ws instanceof WebSocket)) {
            throw new Error('Invalid WebSocket instance provided to ConnectedClient constructor.')
        }
        if (!logger) {
            throw new Error('Invalid logger object provided to ConnectedClient constructor.')
        }

        this.#connectionId = uuidv4()
        //
        this.#ws = ws
        this.#ws.id = this.#connectionId

        this.#logger = logger
        this.#namespace = null
        this.#rooms = new Set()
        this.joinedAt = new Date()

        if (initialUserData && typeof initialUserData === 'object' && initialUserData.userId) {
            this.authenticate(initialUserData)
        }

        this.#logger.info(`[ConnectedClient:${this.#connectionId}] Initialized.`, {
            connectionId: this.#connectionId,
            userId: this.userId, // Може бути null на початку
            isAuthenticated: this.isAuthenticated,
        })
    }

    /**
     * Повертає унікальний ідентифікатор з'єднання.
     * @returns {string}
     */
    get connectionId() {
        return this.#connectionId
    }

    /**
     * Повертає базовий WebSocket екземпляр.
     * @returns {WebSocket}
     */
    get ws() {
        return this.#ws
    }

    /**
     * Повертає поточний стан сирого WebSocket-з'єднання.
     * @returns {number} Стан WebSocket. (0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED)
     */
    get readyState() {
        return this.#ws.readyState
    }

    /**
     * Перевіряє, чи є з'єднання відкритим.
     * @returns {boolean} True, якщо з'єднання відкрите.
     */
    isOpen() {
        return this.#ws.readyState === WebSocket.OPEN
    }

    /**
     * Повертає ідентифікатор користувача, якщо він автентифікований.
     * @returns {string | null}
     */
    get userId() {
        return this.#user.userId || null
    }

    /**
     * Повертає повний об'єкт даних користувача.
     * @returns {object}
     */
    get user() {
        // Повертаємо копію, щоб уникнути прямих змін приватного поля ззовні
        return { ...this.#user }
    }

    /**
     * Встановлює Namespace, до якого належить цей клієнт.
     * @param {Namespace} namespace - Екземпляр Namespace.
     */
    setNamespace(namespace) {
        this.#namespace = namespace
    }

    /**
     * Повертає Namespace, до якого належить цей клієнт.
     * @returns {Namespace | null}
     */
    get namespace() {
        return this.#namespace
    }

    /**
     * Повертає Set з повними назвами кімнат, до яких приєднаний цей клієнт.
     * @returns {Set<string>}
     */
    get rooms() {
        return new Set(this.#rooms) // Повертаємо копію Set для інкапсуляції
    }

    /**
     * Додає з'єднання до кімнати.
     * @param {string} roomName - Назва кімнати.
     */
    joinRoom(roomName) {
        if (this.#rooms.has(roomName)) {
            this.#logger.debug(
                `[ConnectedClient:${this.#connectionId}] Already in room: ${roomName}.`,
                {
                    connectionId: this.#connectionId,
                    roomName: roomName,
                    userId: this.userId,
                },
            )
            return
        }
        this.#rooms.add(roomName)
        this.#logger.info(`[ConnectedClient:${this.#connectionId}] Joined room: ${roomName}`, {
            connectionId: this.#connectionId,
            roomName: roomName,
            currentRooms: Array.from(this.#rooms),
            userId: this.userId,
        })
    }

    /**
     * Видаляє з'єднання з кімнати.
     * @param {string} roomName - Назва кімнати.
     */
    leaveRoom(roomName) {
        if (this.#rooms.delete(roomName)) {
            this.#logger.info(`[ConnectedClient:${this.#connectionId}] Left room: ${roomName}`, {
                connectionId: this.#connectionId,
                roomName: roomName,
                currentRooms: Array.from(this.#rooms),
                userId: this.userId,
            })
        } else {
            this.#logger.warn(
                `[ConnectedClient:${
                    this.#connectionId
                }] Attempted to leave non-existent room: ${roomName}`,
                {
                    connectionId: this.#connectionId,
                    roomName: roomName,
                    userId: this.userId,
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
        return this.#rooms.has(roomName)
    }

    /**
     * Надсилає повідомлення цьому конкретному клієнту.
     * Перевіряє стан WebSocket перед надсиланням та обробляє потенційні помилки.
     * @param {string | object} message - Повідомлення для надсилання (може бути об'єктом, який буде JSON.stringify).
     * @param {object} [options={}] - Додаткові опції для надсилання, що передаються в ws.send() (наприклад, { binary: true }).
     */
    send(message, options = {}) {
        if (this.#ws.readyState === this.#ws.OPEN) {
            try {
                const dataToSend = typeof message === 'object' ? JSON.stringify(message) : message
                this.#ws.send(dataToSend, options, (error) => {
                    if (error) {
                        this.#logger.error(
                            `[ConnectedClient:${this.#connectionId}] Asynchronous send error: ${
                                err.message
                            }`,
                            {
                                connectionId: this.#connectionId,
                                error: error, // Логуємо весь об'єкт помилки
                                message: message,
                                options: options,
                                userId: this.userId,
                            },
                        )
                    }
                })
                this.#logger.debug(`[ConnectedClient:${this.#connectionId}] Message sent.`, {
                    connectionId: this.#connectionId,
                    messageType: typeof message,
                    messageSize: typeof dataToSend === 'string' ? dataToSend.length : 'N/A',
                    options: options,
                    userId: this.userId,
                })
            } catch (error) {
                this.#logger.error(
                    `[ConnectedClient:${this.#connectionId}] Synchronous send error: ${
                        error.message
                    }`,
                    {
                        connectionId: this.#connectionId,
                        error: error,
                        message: message,
                        options: options,
                        userId: this.userId,
                    },
                )
            }
        } else {
            this.#logger.warn(
                `[ConnectedClient:${
                    this.#connectionId
                }] Attempted to send message to closed or closing WebSocket. State: ${
                    this.#ws.readyState
                }`,
                {
                    connectionId: this.#connectionId,
                    wsReadyState: this.#ws.readyState,
                    userId: this.userId,
                    message: message,
                },
            )
        }
    }

    /**
     * Встановлює дані користувача після автентифікації.
     * @param {object} userData - Об'єкт з даними користувача. Обов'язково повинен містити 'userId'.
     */
    authenticate(userData) {
        if (typeof userData !== 'object' || userData === null || !userData.userId) {
            this.#logger.error(
                `[ConnectedClient:${
                    this.#connectionId
                }] Invalid user data provided for authentication.`,
                { connectionId: this.#connectionId, providedData: userData },
            )
            return false // Повертаємо false при невдалій автентифікації
        }

        if (this.isAuthenticated && this.#user.userId === userData.userId) {
            this.#logger.debug(
                `[ConnectedClient:${this.#connectionId}] Already authenticated as ${
                    userData.userId
                }. No change needed.`,
                { connectionId: this.#connectionId, userId: userData.userId },
            )
            return true
        }

        if (this.isAuthenticated && this.#user.userId !== userData.userId) {
            this.#logger.warn(
                `[ConnectedClient:${this.#connectionId}] Re-authenticating connection from ${
                    this.#user.userId
                } to ${userData.userId}. This might indicate a logic error or re-login.`,
                {
                    connectionId: this.#connectionId,
                    oldUserId: this.#user.userId,
                    newUserId: userData.userId,
                },
            )
        }

        this.#user = { ...userData } // Зберігаємо повний об'єкт даних користувача
        this.isAuthenticated = true
        this.#logger.info(
            `[ConnectedClient:${this.#connectionId}] Authenticated as userId: ${this.#user.userId}`,
            {
                connectionId: this.#connectionId,
                userId: this.#user.userId,
                userData: this.#user, // Логуємо повні дані користувача
            },
        )
        return true
    }

    /**
     * Закриває WebSocket з'єднання для цього клієнта.
     * @param {number} [code=1000] - Код закриття.
     * @param {string} [reason=''] - Причина закриття.
     */
    close(code = 1000, reason = '') {
        if (this.#ws.readyState === WebSocket.OPEN) {
            this.#ws.close(code, reason)
            this.#logger.info(
                `[Client:${
                    this.#connectionId
                }] Connection closed by server. Code: ${code}, Reason: ${reason}`,
                {
                    connectionId: this.#connectionId,
                    code: code,
                    reason: reason,
                    userId: this.userId,
                },
            )
        } else if (
            this.#ws.readyState === WebSocket.CLOSING ||
            this.#ws.readyState === WebSocket.CLOSED
        ) {
            this.#logger.warn(
                `[Client:${
                    this.#connectionId
                }] Attempted to close already closed or closing connection. State: ${
                    this.#ws.readyState
                }`,
                {
                    connectionId: this.#connectionId,
                    wsReadyState: this.#ws.readyState,
                    userId: this.userId,
                },
            )
        }
    }
}

export default ConnectedClient
