import { EventEmitter } from './EventEmitter.js'
import crypto from 'crypto'

export class Socket {
    #logger = null

    constructor({ id, rawSocket, namespace, logger = null } = {}) {
        this.id = id
        this.rawSocket = rawSocket
        this.namespace = namespace
        this.#logger = logger.child
            ? logger.child({
                  component: `${this.constructor.name}`,
                  socketId: this.id,
              })
            : logger

        this.eventEmitter = new EventEmitter({ logger: this.#logger })

        /** Стан активності з'єднання для Heartbeat */
        this.isAlive = true

        /** Набір імен кімнат, у яких перебуває цей сокет */
        this.rooms = new Set()

        /** Дані рукостискання (заголовки, query, IP тощо) */
        this.handshake = {}

        /** Час створення з'єднання */
        this.connectedAt = new Date()

        this.#init()
    }

    /* ===============================
     * Getters
     * =============================== */

    /** @returns {number} Час життя з'єднання в мілісекундах */
    get uptime() {
        return Date.now() - this.connectedAt.getTime()
    }

    /** @returns {boolean} Чи відкрите з'єднання на даний момент */
    get isConnected() {
        return this.rawSocket.readyState === this.rawSocket.OPEN
    }

    /* ===============================
     * Public API
     * =============================== */

    on(event, handler) {
        this.eventEmitter.on(event, handler)
        return this
    }

    off(event, handler) {
        this.eventEmitter.off(event, handler)
        return this
    }

    async emit(event, payload) {
        try {
            return await this.eventEmitter.emit(event, payload)
        } catch (error) {
            this.#logger?.error?.(
                `[${this.constructor.name}] Error in socket event handler [${event}]`,
                error,
            )
        }
    }

    /**
     * Надіслати дані клієнту.
     * @param {string|Object} eventOrPayload - Назва події або готовий об'єкт даних.
     * @param {any} [data] - Дані події (якщо перший аргумент — назва події).
     */
    send(eventOrPayload, data) {
        if (!this.isConnected) return

        let payload
        if (typeof eventOrPayload === 'string') {
            payload = JSON.stringify({ event: eventOrPayload, data, ns: this.namespace.name })
        } else {
            payload = JSON.stringify(eventOrPayload)
        }

        try {
            this.rawSocket.send(payload)
        } catch (error) {
            this.#logger?.error?.(
                `[${this.constructor.name}] Помилка відправки даних клієнту ${this.id}`,
                error,
            )
        }
    }

    /**
     * Приєднатися до кімнати.
     * @param {string} roomName - Назва кімнати.
     */
    join(roomName) {
        this.namespace.joinRoom(roomName, this.id)
    }

    /**
     * Вийти з кімнати.
     * @param {string} roomName - Назва кімнати.
     */
    leave(roomName) {
        this.namespace.leaveRoom(roomName, this.id)
    }

    /**
     * Надіслати повідомлення всім у цей неймспейс, крім себе.
     * @param {string} event - Назва події.
     * @param {any} data - Дані повідомлення.
     */
    broadcast(event, data) {
        this.namespace.broadcast(event, data, this.id)
    }

    /**
     * Надіслати Ping клієнту.
     */
    ping() {
        if (!this.isConnected) return
        this.rawSocket.ping()
    }

    /**
     * Примусово розірвати з'єднання.
     */
    terminate() {
        this.rawSocket.terminate()
    }

    /**
     * Коректно закрити з'єднання з кодом та причиною.
     * @param {number} [code=1000] - Статус-код закриття.
     * @param {string} [reason] - Опис причини закриття.
     */
    disconnect(code = 1000, reason = 'Server closed') {
        if (!this.isConnected) {
            return
        }

        this.rawSocket.close(code, reason)
    }

    /* ===============================
     * Internal Methods
     * =============================== */

    /**
     * Ініціалізація внутрішніх обробників подій WebSocket.
     * @private
     */
    #init() {
        // Обробка вхідних повідомлень
        this.rawSocket.on('message', (rawData) => {
            try {
                const message = JSON.parse(rawData)

                // Емітимо подію локально на об'єкті сокета
                if (message.event) {
                    this.emit(message.event, message.data)
                } else {
                    this.emit('message', message)
                }
            } catch (error) {
                this.#logger?.warn?.(
                    `[${this.constructor.name}] Некоректний формат JSON від клієнта ${this.id}`,
                )
                this.emit('error', new Error('Invalid JSON format'))
            }
        })

        // Відповідь на Ping від сервера (автоматично обробляється більшістю клієнтів, але ми фіксуємо активність)
        this.rawSocket.on('pong', () => {
            this.isAlive = true
        })

        this.rawSocket.on('error', (error) => {
            this.#logger?.error?.(
                `[${this.constructor.name}] Помилка транспорту для сокета ${this.id}`,
                error,
            )
            this.emit('transport:error', error)
        })

        // Подія закриття обробляється неймспейсом, але ми можемо додати локальну логіку
        this.rawSocket.on('close', (code, reason) => {
            this.isAlive = false
            this.emit('disconnect', { code, reason })
            this.eventEmitter.destroy()
        })
    }
}
