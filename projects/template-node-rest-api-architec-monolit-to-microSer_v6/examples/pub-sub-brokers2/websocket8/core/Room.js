/**
 * @file Клас для управління логікою кімнат та розсилкою повідомлень.
 * @module core/Room
 */

/**
 * @typedef {import('./Socket.js').Socket} Socket
 * @typedef {import('./Namespace.js').Namespace} Namespace
 * @typedef {import('./MessageEnvelope.js').MessageEnvelopeDTO} MessageEnvelopeDTO
 */

/**
 * Представляє кімнату (групу сокетів).
 * Забезпечує координацію між локальними підключеннями та глобальним брокером.
 *
 * @class Room
 */
export class Room {
    /**
     * @param {string} name - Назва кімнати.
     * @param {Namespace} namespace - Батьківський простір імен.
     */
    constructor(name, namespace) {
        this.name = name
        this.ns = namespace
        this.logger = namespace.logger.child
            ? namespace.logger.child({ room: name })
            : namespace.logger

        /**
         * Набір локальних сокетів, підключених до цієї ноди.
         * @type {Set<Socket>}
         * @private
         */
        this._localSockets = new Set()

        /**
         * Топік для брокера подій (горизонтальне масштабування).
         * @type {string}
         */
        this.topic = `broker:${this.ns.name}:room:${this.name}`

        this._isDestroyed = false
    }

    /**
     * Додає сокет до кімнати локально та оновлює глобальний стан.
     *
     * @param {Socket} socket - Екземпляр сокета.
     * @returns {Promise<void>}
     */
    async add(socket) {
        if (this._isDestroyed || this._localSockets.has(socket)) return

        try {
            this._localSockets.add(socket)
            // Реєструємо присутність сокета в глобальному стані (Redis/Memory)
            await this.ns.state.addUserToRoom(this.ns.name, this.name, socket.id)

            this.logger.debug(`Socket ${socket.id} joined room`, {
                totalLocal: this._localSockets.size,
            })
        } catch (error) {
            this._localSockets.delete(socket)
            this.logger.error(`Failed to add socket to room state: ${error.message}`)
            throw error
        }
    }

    /**
     * Видаляє сокет з кімнати.
     *
     * @param {Socket} socket - Екземпляр сокета.
     * @returns {Promise<void>}
     */
    async remove(socket) {
        if (!this._localSockets.has(socket)) return

        this._localSockets.delete(socket)

        try {
            await this.ns.state.removeUserFromRoom(this.ns.name, this.name, socket.id)
        } catch (error) {
            this.logger.error(`Error removing socket from state: ${error.message}`)
        }

        this.logger.debug(`Socket ${socket.id} left room`, {
            remainingLocal: this._localSockets.size,
        })

        // Якщо на цій ноді більше немає підключень до цієї кімнати
        if (this._localSockets.size === 0) {
            this.destroy()
        }
    }

    /**
     * Публікує повідомлення в кімнату (на всі сервери через брокер).
     *
     * @param {MessageEnvelopeDTO} envelope - Конверт повідомлення.
     * @returns {Promise<void>}
     */
    async broadcast(envelope) {
        if (this._isDestroyed) return

        // Відправляємо брокеру, який розішле це всім серверам (включаючи цей)
        await this.ns.broker.publish(this.topic, envelope)
    }

    /**
     * Відправляє повідомлення ТІЛЬКИ локальним підписникам на цій ноді.
     * Викликається зазвичай адаптером брокера при отриманні повідомлення з мережі.
     *
     * @param {MessageEnvelopeDTO} envelope
     */
    dispatch(envelope) {
        if (this._isDestroyed) return

        // Використовуємо ітератор, щоб не блокувати цикл подій надовго
        // Для екстремальних навантажень тут можна додати setImmediate через кожні N пакетів
        for (const socket of this._localSockets) {
            socket.rawSend(envelope)
        }
    }

    /**
     * Очищення ресурсів кімнати.
     */
    destroy() {
        if (this._isDestroyed) return

        this._isDestroyed = true
        this._localSockets.clear()
        this.ns._removeRoom(this.name)

        this.logger.info(`Room ${this.name} destroyed and cleaned up`)
    }
}
