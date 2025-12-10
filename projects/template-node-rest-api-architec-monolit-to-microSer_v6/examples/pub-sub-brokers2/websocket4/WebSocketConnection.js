/**
 * @file Клас для управління окремим WebSocket-з'єднанням.
 */

/**
 * Управляє окремим WebSocket-з'єднанням, включаючи підписку на кімнати/простори імен,
 * статус автентифікації та механізм підтримки з'єднання (heartbeat).
 */
class WebSocketConnection {
    /**
     * @private
     * @type {Set<string>} Набір унікальних ідентифікаторів підписок.
     * Формат ідентифікатора: `${namespace}::${roomName}`.
     */
    #subscriptions = new Set()

    /**
     * @private
     * @type {object | null} Приватний логер, якщо був наданий.
     */
    #logger = null

    /**
     * @private
     * @type {string | null} ID автентифікованого користувача (якщо автентифіковано).
     */
    #userId = null

    /**
     * @type {object} Оригінальний WebSocket-об'єкт.
     */
    ws

    /**
     * @type {string} Унікальний ID сесії клієнта.
     */
    id

    /**
     * @type {boolean} Поточний статус активності (для heartbeat/pong).
     */
    isAlive = true

    /**
     * @type {Date} Час встановлення з'єднання.
     */
    connectedAt

    /**
     * @type {Date} Час останньої зареєстрованої активності.
     */
    lastActivity

    /**
     * Створює екземпляр WebSocketConnection.
     * @param {object} ws - Екземпляр WebSocket (наприклад, з 'ws' library).
     * @param {string} id - Унікальний ідентифікатор з'єднання (UUID).
     * @param {object} [logger=null] - Опціональний об'єкт логера (з методами trace, error тощо).
     * @throws {Error} Якщо екземпляр WebSocket або ID не надано.
     */
    constructor(ws, id, logger = null) {
        if (!ws || !id) {
            throw new Error('WebSocket instance and connection ID must be provided.')
        }

        this.ws = ws
        this.id = id
        this.#logger = logger
        this.isAlive = true

        const now = new Date()
        this.connectedAt = now
        this.lastActivity = now
    }

    // --- Приватні допоміжні методи ---

    /**
     * Оновлює час останньої активності.
     * @private
     */
    #updateActivity() {
        this.lastActivity = new Date()
    }

    /**
     * Формує стандартизований унікальний ключ підписки.
     * @private
     * @param {string} namespace - Простір імен.
     * @param {string} roomName - Назва кімнати.
     * @returns {string} Унікальний ключ підписки: `${namespace}::${roomName}`.
     * @throws {Error} Якщо простір імен або назва кімнати відсутні.
     */
    #getSubscriptionKey(namespace, roomName) {
        if (!namespace || !roomName) {
            this.#logger?.error(
                `Invalid subscription key attempt: ns='${namespace}', room='${roomName}'`,
            )
            throw new Error('Namespace and roomName must be provided.')
        }
        // Використовуємо надійний розділювач, який рідко зустрічається в назвах
        return `${namespace}::${roomName}`
    }

    // --- Методи комунікації ---

    /**
     * Надсилає дані клієнту через WebSocket, якщо з'єднання відкрите.
     * @param {*} data - Дані для відправки (бажано JSON-рядок або Buffer).
     * @param {object} [options={}] - Додаткові опції для методу send.
     */
    send(data, options = {}) {
        if (this.ws.readyState === this.ws.OPEN) {
            try {
                this.ws.send(data, options)
                this.#updateActivity()
                this.#logger?.trace(`Data sent to connection ${this.id}`)
            } catch (error) {
                this.#logger?.error(`Failed to send data to ${this.id}:`, error)
            }
        } else {
            this.#logger?.warn(
                `Attempted to send data while connection ${this.id} state was ${this.ws.readyState}`,
            )
        }
    }

    // --- Методи керування підписками (Namespaces & Rooms) ---

    /**
     * Приєднує клієнта до певної кімнати в певному просторі імен.
     * @param {string} namespace - Простір імен.
     * @param {string} roomName - Назва кімнати.
     */
    joinRoom(namespace, roomName) {
        const key = this.#getSubscriptionKey(namespace, roomName)
        this.#subscriptions.add(key)
        this.#logger?.debug(`Client ${this.id} joined room: ${key}`)
    }

    /**
     * Видаляє клієнта з певної кімнати в певному просторі імен.
     * @param {string} namespace - Простір імен.
     * @param {string} roomName - Назва кімнати.
     */
    leaveRoom(namespace, roomName) {
        const key = this.#getSubscriptionKey(namespace, roomName)
        const deleted = this.#subscriptions.delete(key)
        if (deleted) {
            this.#logger?.debug(`Client ${this.id} left room: ${key}`)
        }
    }

    /**
     * Перевіряє, чи належить клієнт до певної кімнати/простору імен.
     * @param {string} namespace - Простір імен.
     * @param {string} roomName - Назва кімнати.
     * @returns {boolean} True, якщо клієнт підписаний.
     */
    isInRoom(namespace, roomName) {
        const key = this.#getSubscriptionKey(namespace, roomName)
        return this.#subscriptions.has(key)
    }

    /**
     * Перевіряє, чи підписаний клієнт хоч до однієї кімнати в цьому просторі імен.
     * @param {string} namespace - Простір імен.
     * @returns {boolean}
     */
    isInNamespace(namespace) {
        const prefix = `${namespace}::`
        for (const key of this.#subscriptions) {
            if (key.startsWith(prefix)) {
                return true
            }
        }
        return false
    }

    /**
     * Залишає всі кімнати в межах вказаного простору імен.
     * @param {string} namespace - Простір імен для виходу (наприклад, 'game').
     */
    leaveNamespace(namespace) {
        const prefix = `${namespace}::`
        this.#subscriptions.forEach((key) => {
            if (key.startsWith(prefix)) {
                this.#subscriptions.delete(key)
            }
        })
        this.#logger?.debug(`Client ${this.id} left namespace: ${namespace}`)
    }

    // --- Методи керування статусом та Heartbeat ---

    /**
     * Позначає з'єднання як "живе" (отримано pong або повідомлення).
     */
    markAlive() {
        this.isAlive = true
        this.#updateActivity()
    }

    /**
     * Ініціює перевірку активності (надсилає ping).
     */
    ping() {
        if (this.ws.readyState === this.ws.OPEN) {
            this.isAlive = false // Очікуємо pong у відповідь, щоб скинути цей статус на true
            this.ws.ping()
            this.#logger?.trace(`Ping sent to ${this.id}`)
        }
    }

    // --- Додаткові методи та властивості ---

    /**
     * Встановлює статус автентифікації та ID користувача.
     * @param {string} userId - ID користувача після успішної автентифікації.
     */
    authenticate(userId) {
        if (!userId) {
            throw new Error('UserId must be provided for authentication.')
        }
        this.#userId = userId
        this.#updateActivity()
        this.#logger?.info(`Connection ${this.id} authenticated as user ${userId}`)
    }

    /**
     * Перевіряє, чи користувач автентифікований.
     * @returns {boolean}
     */
    isAuthenticated() {
        return !!this.#userId
    }

    /**
     * Повертає ID автентифікованого користувача.
     * @returns {string | null}
     */
    getUserId() {
        return this.#userId
    }

    /**
     * Закриває WebSocket з'єднання.
     * @param {number} [code=1000] - Код закриття.
     * @param {string} [reason="Normal closure"] - Причина закриття.
     */
    close(code = 1000, reason = 'Normal closure') {
        if (this.ws.readyState !== this.ws.CLOSED) {
            this.ws.close(code, reason)
            this.#logger?.info(`Connection ${this.id} closed with code ${code}: ${reason}`)
        }
    }
}

export default WebSocketConnection
