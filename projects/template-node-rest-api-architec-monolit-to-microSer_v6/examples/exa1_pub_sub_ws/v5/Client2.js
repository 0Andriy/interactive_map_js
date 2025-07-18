// Client.js

import { WebSocket } from 'ws' // Додаємо імпорт WebSocket
import { createLogger } from './logger.js' // Ваш логер

/**
 * Клас, що представляє підключеного WebSocket-клієнта.
 * Інкапсулює WebSocket-з'єднання, його стан та взаємодію.
 */
class ConnectedClient {
    /**
     * @private
     * Унікальний ідентифікатор з'єднання клієнта.
     * @type {string}
     */
    #connectionId

    /**
     * @private
     * Об'єкт сирого WebSocket з'єднання.
     * @type {WebSocket}
     */
    #ws

    /**
     * @private
     * Об'єкт логера для цього клієнта.
     * @type {object}
     */
    #logger

    /**
     * @private
     * ID користувача, асоційований з цим з'єднанням (після автентифікації).
     * @type {string | null}
     */
    #userId = null

    /**
     * @private
     * Чи автентифікований клієнт.
     * @type {boolean}
     */
    #isAuthenticated = false

    /**
     * @private
     * Набір назв кімнат, до яких приєднаний цей клієнт (повні назви, наприклад, "namespaceName/roomName").
     * @type {Set<string>}
     */
    #rooms = new Set()

    /**
     * @private
     * Посилання на Namespace, до якого належить клієнт.
     * @type {import('./Namespace.js').default | null}
     */
    #namespace = null

    /**
     * @private
     * Прапорець, що вказує, чи клієнт відповів на останній ping.
     * @type {boolean}
     */
    #isAlive = true // Переносимо isAlive сюди

    /**
     * @private
     * Таймер для відстеження очікування PONG.
     * @type {NodeJS.Timeout | null}
     */
    #pongTimer = null // Переносимо pongTimer сюди

    /**
     * @param {WebSocket} ws - Сирий WebSocket-об'єкт.
     * @param {object} [logger=createLogger('ConnectedClient')] - Об'єкт логера.
     * @param {string} [connectionId=uuidv4()] - Унікальний ідентифікатор для цього з'єднання.
     */
    constructor(ws, logger = createLogger('ConnectedClient'), connectionId = uuidv4()) {
        this.#ws = ws
        this.#logger = logger
        this.#connectionId = connectionId

        // Важливо: перенаправляємо подію 'pong' з сирого WS на обробник класу
        this.#ws.on('pong', () => this.#handlePong())
    }

    /**
     * Повертає сирий WebSocket-об'єкт.
     * @returns {WebSocket}
     */
    get ws() {
        return this.#ws
    }

    /**
     * Повертає унікальний ідентифікатор з'єднання.
     * @returns {string}
     */
    get connectionId() {
        return this.#connectionId
    }

    /**
     * Повертає ID користувача.
     * @returns {string | null}
     */
    get userId() {
        return this.#userId
    }

    /**
     * Встановлює ID користувача після автентифікації.
     * @param {string} id - ID користувача.
     */
    setUserId(id) {
        this.#userId = id
    }

    /**
     * Перевіряє, чи автентифікований клієнт.
     * @returns {boolean}
     */
    get isAuthenticated() {
        return this.#isAuthenticated
    }

    /**
     * Встановлює статус автентифікації клієнта.
     */
    authenticate() {
        this.#isAuthenticated = true
    }

    /**
     * Повертає поточний Namespace клієнта.
     * @returns {import('./Namespace.js').default | null}
     */
    get namespace() {
        return this.#namespace
    }

    /**
     * Встановлює Namespace для цього клієнта.
     * @param {import('./Namespace.js').default} ns - Об'єкт Namespace.
     */
    setNamespace(ns) {
        this.#namespace = ns
    }

    /**
     * Повертає набір кімнат, до яких приєднаний клієнт.
     * @returns {Set<string>}
     */
    get rooms() {
        return this.#rooms
    }

    /**
     * Додає кімнату до списку кімнат клієнта.
     * @param {string} roomFullName - Повна назва кімнати (e.g., "namespaceName/roomName").
     */
    addRoom(roomFullName) {
        this.#rooms.add(roomFullName)
        this.#logger.debug(`[Client:${this.#connectionId}] Added to room: ${roomFullName}.`, {
            room: roomFullName,
        })
    }

    /**
     * Видаляє кімнату зі списку кімнат клієнта.
     * @param {string} roomFullName - Повна назва кімнати.
     */
    removeRoom(roomFullName) {
        this.#rooms.delete(roomFullName)
        this.#logger.debug(`[Client:${this.#connectionId}] Removed from room: ${roomFullName}.`, {
            room: roomFullName,
        })
    }

    /**
     * Надсилає повідомлення клієнту.
     * @param {string | object} message - Повідомлення для надсилання (буде JSON.stringify'd, якщо це об'єкт).
     * @param {object} [options={}] - Додаткові опції для send (наприклад, { binary: true }).
     * @returns {boolean} True, якщо повідомлення було надіслано, false інакше.
     */
    send(message, options = {}) {
        if (this.#ws.readyState === WebSocket.OPEN) {
            try {
                const dataToSend = typeof message === 'object' ? JSON.stringify(message) : message
                this.#ws.send(dataToSend, options)
                this.#logger.debug(
                    `[Client:${this.#connectionId}] Sent message. Type: ${
                        typeof message === 'object' ? message.type : 'raw'
                    }.`,
                    {
                        connectionId: this.#connectionId,
                        messagePreview:
                            typeof message === 'object'
                                ? JSON.stringify(message).substring(0, 100)
                                : message.substring(0, 100),
                    },
                )
                return true
            } catch (error) {
                this.#logger.error(
                    `[Client:${this.#connectionId}] Error sending message: ${error.message}.`,
                    {
                        connectionId: this.#connectionId,
                        error: error.message,
                        stack: error.stack,
                    },
                )
                return false
            }
        } else {
            this.#logger.warn(
                `[Client:${
                    this.#connectionId
                }] Attempted to send message to non-open WebSocket (State: ${
                    this.#ws.readyState
                }).`,
                {
                    connectionId: this.#connectionId,
                    wsReadyState: this.#ws.readyState,
                },
            )
            return false
        }
    }

    /**
     * Закриває з'єднання клієнта.
     * @param {number} [code=1000] - Код закриття.
     * @param {string} [reason=''] - Причина закриття.
     */
    close(code = 1000, reason = '') {
        if (this.#ws.readyState === WebSocket.OPEN) {
            this.#ws.close(code, reason)
            this.#logger.info(
                `[Client:${
                    this.#connectionId
                }] Closing connection. Code: ${code}, Reason: ${reason}.`,
                {
                    connectionId: this.#connectionId,
                    code,
                    reason,
                },
            )
        } else {
            this.#logger.debug(
                `[Client:${this.#connectionId}] Connection already in state ${
                    this.#ws.readyState
                }, skipping close.`,
                {
                    connectionId: this.#connectionId,
                    wsReadyState: this.#ws.readyState,
                },
            )
        }
        // Очищаємо всі таймери, пов'язані з heartbeat
        this.clearPongTimer()
    }

    /**
     * Примусово термінує з'єднання клієнта.
     */
    terminate() {
        if (
            this.#ws.readyState === WebSocket.OPEN ||
            this.#ws.readyState === WebSocket.CONNECTING
        ) {
            this.#ws.terminate()
            this.#logger.warn(`[Client:${this.#connectionId}] Connection terminated.`, {
                connectionId: this.#connectionId,
            })
        } else {
            this.#logger.debug(
                `[Client:${this.#connectionId}] Connection already in state ${
                    this.#ws.readyState
                }, skipping terminate.`,
                {
                    connectionId: this.#connectionId,
                    wsReadyState: this.#ws.readyState,
                },
            )
        }
        // Очищаємо всі таймери, пов'язані з heartbeat
        this.clearPongTimer()
    }

    /**
     * Повертає стан активності heartbeat.
     * @returns {boolean}
     */
    get isAlive() {
        return this.#isAlive
    }

    /**
     * Встановлює стан активності heartbeat.
     * @param {boolean} status
     */
    setAlive(status) {
        this.#isAlive = status
    }

    /**
     * Встановлює таймер очікування PONG.
     * @param {NodeJS.Timeout | null} timer
     */
    setPongTimer(timer) {
        this.clearPongTimer() // Спочатку очищаємо попередній
        this.#pongTimer = timer
    }

    /**
     * Очищає таймер очікування PONG.
     */
    clearPongTimer() {
        if (this.#pongTimer) {
            clearTimeout(this.#pongTimer)
            this.#pongTimer = null
        }
    }

    /**
     * Обробляє отримання PONG повідомлення від клієнта.
     * @private
     */
    #handlePong() {
        this.#isAlive = true
        this.clearPongTimer()
        this.#logger.debug(`[Client:${this.#connectionId}] Received pong. Connection active.`)
    }

    /**
     * Повертає поточний readyState сирого WebSocket-з'єднання.
     * @returns {number}
     */
    get readyState() {
        return this.#ws.readyState
    }

    /**
     * Надсилає PING-фрейм клієнту.
     */
    ping() {
        if (this.#ws.readyState === WebSocket.OPEN) {
            this.#ws.ping()
            this.#logger.debug(`[Client:${this.#connectionId}] Sent ping.`)
        }
    }
}

export default ConnectedClient
