import { PubSub } from './PubSub.js'
import crypto from 'crypto'

/**
 * @typedef {import('./Namespace.js').Namespace} Namespace
 * @typedef {import('../interfaces/Logger.js').Logger} Logger
 */

/**
 * Клас Socket представляє індивідуальне клієнтське з'єднання.
 * Розширює PubSub для локальної обробки подій конкретного сокета.
 *
 * @class Socket
 * @extends PubSub
 */
export class Socket extends PubSub {
    /**
     * @param {Object} rawSocket - Оригінальний об'єкт сокета (напр. з бібліотеки 'ws').
     * @param {Namespace} namespace - Простір імен, до якого належить сокет.
     * @param {Logger} logger - Інстанс логера.
     */
    constructor(rawSocket, namespace, logger) {
        super()
        this.id = crypto.randomUUID()
        this.rawSocket = rawSocket
        this.namespace = namespace

        // Використовуємо child-логери для контекстного дебагу
        this.logger = logger.child ? logger.child({ socketId: this.id }) : logger

        /** @type {Set<Function>} Pipeline для обробки вхідних пакетів */
        this.middlewares = new Set()
        this.handshake = {}
        this.isAlive = true
        this.user = null
        this.rooms = new Set()

        this._init()
    }

    /**
     * Ініціалізація обробників подій сирого сокета.
     * @private
     */
    _init() {
        this.rawSocket.on('message', async (rawData) => {
            try {
                const data = JSON.parse(rawData)
                const { event, payload } = data

                if (event === 'pong') {
                    this.isAlive = true
                    return
                }

                // Виконання ланцюжка мідлварів (аналог Express/Koa)
                await this._runMiddlewares(event, payload)

                // Виклик локальних підписників через PubSub.emit
                await this.emit(event, payload)
            } catch (error) {
                this.logger?.error(`Socket pipeline error: ${error.message}`, {
                    stack: error.stack,
                })
                this.rawSend({
                    event: 'error',
                    payload: 'Invalid message format or processing error',
                })
            }
        })

        this.rawSocket.on('pong', () => {
            this.isAlive = true
        })
        this.rawSocket.on('close', () => this.destroy())
        this.rawSocket.on('error', (err) => this.logger?.error('Socket error:', err))
    }

    /**
     * Реєстрація мідлвара для обробки вхідних пакетів.
     * @param {Function} fn - Функція вигляду (packet, next) => void
     */
    use(fn) {
        if (typeof fn !== 'function') throw new Error('Middleware must be a function')
        this.middlewares.add(fn)
    }

    /**
     * Приватний метод для запуску мідлварів.
     * @private
     */
    async _runMiddlewares(event, payload) {
        const packet = { event, payload }
        const middlewares = Array.from(this.middlewares)

        let index = 0
        const next = async () => {
            if (index < middlewares.length) {
                const middleware = middlewares[index++]
                await middleware(packet, next)
            }
        }

        await next()
    }

    /**
     * Додає сокет до кімнати.
     * @param {string} roomName
     */
    async join(roomName) {
        await this.namespace.joinRoom(roomName, this)
        this.rooms.add(roomName)
        this.logger?.debug(`Joined room: ${roomName}`)
    }

    /**
     * Видаляє сокет з кімнати.
     * @param {string} roomName
     */
    async leave(roomName) {
        await this.namespace.leaveRoom(roomName, this)
        this.rooms.delete(roomName)
        this.logger?.debug(`Left room: ${roomName}`)
    }

    /**
     * Відправка сирих даних клієнту.
     * @param {Object} data
     */
    rawSend(data) {
        if (this.rawSocket.readyState === this.rawSocket.OPEN) {
            // 1 === OPEN
            this.rawSocket.send(JSON.stringify(data))
        }
    }

    /**
     * Повне очищення ресурсів при закритті з'єднання.
     */
    destroy() {
        this.rooms.clear()
        this.middlewares.clear()
        this.clear() // Очищення PubSub
        this.logger?.info('Socket destroyed')
    }
}
