import { PubSub } from './PubSub.js'
import { MiddlewareRunner } from './MiddlewareRunner.js'
import crypto from 'crypto'

/**
 * @typedef {import('./Namespace.js').Namespace} Namespace
 * @typedef {import('../interfaces/Logger.js').Logger} Logger
 */

/**
 * Клас, що представляє WebSocket з'єднання.
 * Композиція з PubSub для обробки подій та MiddlewareRunner для мідлварів.
 */
export class Socket {
    /**
     * @param {Object} rawSocket - Оригінальний об'єкт сокета (напр. з бібліотеки 'ws').
     * @param {Namespace} namespace - Простір імен, до якого належить сокет.
     * @param {Logger} logger - Інстанс логера.
     */
    constructor(rawSocket, namespace, logger = null) {
        /** Унікальний ідентифікатор сокета
         * @type {string}
         */
        this.id = crypto.randomUUID()

        /** Сирий WebSocket об'єкт
         * @type {Object}
         */
        this.rawSocket = rawSocket

        /** Простір імен сокета
         * @type {Namespace}
         */
        this.namespace = namespace

        /** Інстанс логера
         * @type {Logger|null}
         */
        this.logger = logger.child ? logger.child({ socketId: this.id }) : logger

        /** PubSub для локальної обробки подій сокета (внутрішній)
         * @type {PubSub}
         */
        this.events = new PubSub({ logger: this.logger })

        /** Ланцюжок middleware для обробки вхідних повідомлень
         * @type {MiddlewareRunner}
         */
        this.pipeline = new MiddlewareRunner({ logger: this.logger })

        /** Набір кімнат, до яких належить сокет
         * @type {Set<string>}
         */
        this.rooms = new Set()

        /** Дані handshake підключення
         * @type {Object}
         */
        this.handshake = {}

        /** Прапорець, що вказує, чи сокет активний
         * @type {boolean}
         */
        this.isAlive = true

        /** Дані користувача, пов'язані з сокетом
         * @type {Object|null}
         */
        this.user = this._generateDefaultUser()

        /**
         * Час підключення сокета
         * @type {Date}
         */
        this.connectedAt = new Date()

        /** Час останньої активності сокета
         * @type {number}
         */
        this._lastActivity = Date.now()

        /* Ініціалізація внутрішніх подій сокета */
        this._init()

        this.logger?.info('Socket initialized', {
            namespace: this.namespace.name,
            connectedAt: this.connectedAt.toISOString(),
        })
    }

    /**
     * Повертає тривалість з'єднання в мілісекундах.
     * @returns {number}
     * @example
     * const socketUptime = socket.uptime
     */
    get uptime() {
        return Date.now() - this.connectedAt.getTime()
    }

    /**
     * Повертає час останньої активності (отримання повідомлення).
     * @returns {number}
     * @example
     * const lastActive = socket.lastActivity
     */
    get lastActivity() {
        return this._lastActivity
    }

    /**
     * Генерує шаблонного гостя.
     * Можна викликати повторно, якщо авторизація не вдалася.
     * @returns {Object} Об'єкт користувача гостя.
     * @example
     * const guestUser = socket._generateDefaultUser()
     */
    _generateDefaultUser() {
        // Беремо частину UUID до першого дефіса (напр. '550e8400')
        const shortId = this.id.split('-')[0]

        return {
            id: `guest_${shortId}`,
            name: `Anonymous-${shortId}`,
            role: 'guest',
            isAuthorized: false,
            createdAt: new Date(),
        }
    }

    /**
     * Оновлює дані користувача після успішної авторизації.
     * @param {Object} userData - Дані користувача.
     * @example
     * socket.setUser({ id: 'user_123', name: 'John Doe', role: 'member' })
     */
    setUser(userData) {
        // Зберігаємо посилання на старого гостя для можливого перенесення даних
        const oldUserId = this.user?.id

        // Оновлюємо дані користувача
        this.user = {
            ...userData,
            id: userData.id || userData._id || oldUserId,
            isAuthorized: true,
            authenticatedAt: new Date(),
        }

        // Оновлюємо мапу в Namespace (якщо ID змінився)
        if (oldUserId !== this.user.id) {
            this.ns.updateSocketIdentity(this, oldUserId)
        }

        this.logger?.info('User identity updated', {
            socketId: this.id,
            userId: this.user.id,
        })
    }

    /**
     * Перевірка, чи сокет є "завислим" (наприклад, не було повідомлень > 5 хв)
     * @param {number} timeoutMs - Час в мілісекундах для вважання сокета "завислим". За замовчуванням 300000 (5 хв).
     * @returns {boolean}
     * @example
     * if (socket.isIdle(60000)) {
     *     console.log('Socket is idle for more than 1 minute');
     * }
     */
    isIdle(timeoutMs = 300000) {
        return Date.now() - this._lastActivity > timeoutMs
    }

    /**
     * Реєстрація обробника подій
     * @param {string} event
     * @param {Function} handler
     * @returns {Socket} Повертає інстанс сокета для ченінгу.
     * @example
     * socket.on('message', (data) => {
     *     console.log('Received message:', data);
     * });
     */
    on(event, handler) {
        this.events.on(event, handler)
        return this
    }

    /**
     * Видалення обробника подій (Proxy to PubSub)
     * @return {Socket} Повертає інстанс сокета для ченінгу.
     * @param {string} event
     * @param {Function} handler
     * @example
     * socket.off('room_created', handlerFunction);
     */
    off(event, handler) {
        this.events.off(event, handler)
        return this
    }

    /**
     * Надсилає подію клієнту
     * @param {string} event
     * @param {any} payload
     * @example
     * socket.emit('message', { text: 'Hello, client!' });
     */
    emit(event, payload) {
        this.rawSend({ event, payload })
    }

    /**
     * Реєстрація middleware
     * @param {Function} fn
     * @returns {Socket} Повертає інстанс сокета для ченінгу.
     * @example
     * socket.use(async (ctx, next) => {
     *     console.log('Received event:', ctx.event);
     *     await next();
     * });
     */
    use(fn) {
        this.pipeline.use(fn)
        return this
    }

    /**
     * Ініціалізація внутрішніх подій
     * @private
     */
    _init() {
        this.rawSocket.on('message', async (rawData) => {
            this.logger?.debug(`Incoming packet: ${rawData.toString().substring(0, 100)}`)

            // Оновлюємо час активності
            this._lastActivity = Date.now()

            // Парсинг вхідних даних
            let parsed
            try {
                parsed = JSON.parse(rawData.toString())
            } catch (error) {
                this.logger?.error('Failed to parse incoming JSON', {
                    error: error.message,
                    preview: rawData.toString().substring(0, 100),
                })
                return
            }

            const { event, payload } = parsed

            if (!event) return

            // Heartbeat check (програмний)
            if (event === 'pong') {
                this.isAlive = true
                return
            }

            const ctx = {
                event,
                payload,
                socket: this,
                timestamp: this._lastActivity,
            }

            try {
                // Прохід через ланцюжок middleware
                await this.pipeline.execute(ctx)

                // Виклик підписників на подію
                await this.events.emit(ctx.event, ctx.payload)
            } catch (error) {
                this.logger?.error('Packet processing error', {
                    event,
                    error: error.message,
                    stack: error.stack,
                })
                this.emit('error', { message: 'Internal processing error' })
            }
        })

        // Обробка pong для heartbeat механізму WebSocket
        this.rawSocket.on('pong', () => {
            this.isAlive = true
        })

        // Обробка закриття з'єднання сокета
        this.rawSocket.on('close', (code, reason) => {
            this.logger?.info('Socket transport closed', {
                code,
                reason: reason.toString(),
                uptime: this.uptime,
            })

            this.destroy()
        })

        // Обробка помилок сокета
        this.rawSocket.on('error', (error) => {
            this.logger?.error('Socket transport error', { error: error.message })
        })
    }

    /** Відправка ping клієнту для перевірки активності.
     * @example
     * socket.ping();
     */
    ping() {
        if (this.rawSocket.readyState !== this.rawSocket.OPEN) {
            this.logger?.warn('Attempted to ping closed socket', {
                readyState: this.rawSocket.readyState,
            })
            return
        }

        try {
            this.rawSocket.ping()
            this.emit('ping', { timestamp: Date.now() })
        } catch (error) {
            this.logger?.error('Ping failed', { error: error.message })
        }
    }

    /**
     * Відправка сирих даних клієнту.
     * @param {Object} data
     * @example
     * socket.rawSend({ event: 'ping' });
     */
    rawSend(data) {
        if (this.rawSocket.readyState !== this.rawSocket.OPEN) {
            this.logger?.warn('Attempted to send data on closed socket', {
                readyState: this.rawSocket.readyState,
                data: data,
            })
            return
        }

        try {
            this.rawSocket.send(JSON.stringify(data))
        } catch (error) {
            this.logger?.error('Send failed', { error: error.message })
        }
    }

    /**
     * Додає сокет до кімнати.
     * @param {string} roomName
     * @example
     * socket.join('chat-room-1')
     */
    async join(roomName) {
        await this.namespace.joinRoom(roomName, this)
        this.rooms.add(roomName)
        this.logger?.debug(`Joined room: ${roomName}`, {
            count: this.rooms.size,
            rooms: Array.from(this.rooms),
        })
    }

    /**
     * Видаляє сокет з кімнати.
     * @param {string} roomName
     * @example
     * socket.leave('chat-room-1')
     */
    async leave(roomName) {
        await this.namespace.leaveRoom(roomName, this)
        this.rooms.delete(roomName)
        this.logger?.debug(`Left room: ${roomName}`, {
            count: this.rooms.size,
            rooms: Array.from(this.rooms),
        })
    }

    /**
     * Метод для примусового відключення з кодом
     * @param {number} code - Код закриття WebSocket (за замовчуванням 1000 - нормальне закриття)
     * @param {string} reason - Причина закриття (за замовчуванням 'Server closed')
     * @returns {Promise<void>}
     * @example
     * await socket.disconnect(4001, 'Server is restarting');
     */
    async disconnect(code = 1000, reason = 'Server closed') {
        this.logger?.info(`Disconnecting socket: ${reason}`, {
            code,
            reason,
        })
        if (this.rawSocket) {
            this.rawSocket.close(code, reason)
        }
        await this.destroy()
    }

    /**
     * Очищення ресурсів сокета.
     * @return {Promise<void>}
     * @example
     * await socket.destroy();
     */
    async destroy() {
        // Видаляємо сокет з усіх кімнат у просторі імен
        await this.namespace.removeSocket(this)

        // Очищаємо ресурси
        this.rooms.clear()
        this.events.clear()
        this.pipeline.clear()

        // Позначення як неактивного
        this.isAlive = false
        this.user = null

        //
        this.logger?.info('Socket destroyed and resources cleaned up')
    }
}
