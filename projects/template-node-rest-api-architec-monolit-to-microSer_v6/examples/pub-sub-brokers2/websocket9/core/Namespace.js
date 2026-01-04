import { PubSub } from './PubSub.js'
import { Room } from './Room.js'
import { MiddlewareRunner } from './MiddlewareRunner.js'
import { MessageEnvelope } from './MessageEnvelope.js'

/**
 * @typedef {import('../interfaces/IStateAdapter.js').IStateAdapter} IStateAdapter
 * @typedef {import('../interfaces/IBrokerAdapter.js').IBrokerAdapter} IBrokerAdapter
 */

/**
 * @class Namespace
 * @classdesc Керує логікою групування сокетів, кімнат та маршрутизацією через брокер.
 */
export class Namespace {
    /**
     * @param {string} name - Namespace name.
     * @param {Object} deps - Dependencies.
     * @param {IStateAdapter} deps.state
     * @param {IBrokerAdapter} deps.broker
     * @param {string} deps.serverId - Unique ID for this server node.
     * @param {Object} deps.logger
     */
    constructor(name, deps) {
        /**
         * Назва простору імен.
         * @type {string}
         */
        this.name = name

        /**
         * Інстанс адаптера стану (state adapter).
         * @type {IStateAdapter}
         */
        this.state = deps.state

        /**
         * Інстанс адаптера брокера (broker adapter).
         * @type {IBrokerAdapter}
         */
        this.broker = deps.broker

        /** Унікальний ідентифікатор цього серверного вузла.
         * @type {string}
         */
        this.serverId = deps.serverId

        /** Інстанс логера.
         * @type {import('../interfaces/Logger.js').Logger}
         */
        this.logger = deps.logger.child
            ? deps.logger.child({ ns: name, serverId: this.serverId })
            : deps.logger

        /** Події неймспейсу.
         * @type {PubSub}
         */
        this.events = new PubSub({ logger: this.logger })

        /** Запуск middlewares.
         * @type {MiddlewareRunner}
         */
        this.pipeline = new MiddlewareRunner({ logger: this.logger })

        /** Локальні сокети, підключені до цього неймспейсу.
         * @type {Map<string, import('./Socket.js').Socket>}
         */
        this._localSockets = new Map()

        /**
         * Оптимізація для швидкого пошуку сокетів юзера O(1)
         * @type {Map<string, Set<import('./Socket.js').Socket>>}
         */
        this._userToSockets = new Map()

        /**
         * Кімнати цього неймспейсу.
         * @type {Map<string, Room>}
         */
        this.rooms = new Map()

        /**
         * Топік для брокера подій (горизонтальне масштабування).
         * @type {string}
         */
        this.topic = `broker:ns:${this.name}:*`

        /**
         * Час створення неймспейсу.
         * @type {number}
         */
        this.createdAt = Date.now()

        /** Позначка знищення неймспейсу.
         * @type {boolean}
         * @private
         */
        this._isDestroyed = false

        // Підписка на брокер для отримання глобальних повідомлень
        this._subscribeToBroker()

        this.logger?.info('Namespace initialized', {
            serverId: this.serverId,
            topic: this.topic,
        })
    }

    /**
     * Namespace uptime in milliseconds.
     * @returns {number}
     * @example
     * const nsUptime = namespace.uptime;
     */
    get uptime() {
        return Date.now() - this.createdAt
    }

    /**
     * Повертає загальну кількість учасникі в namespace (всіх сокетів на всіх серверах).
     * @returns {Promise<number>}
     * @example
     * const memberCount = await namespace.getMemberCount();
     */
    async getMemberCount() {
        try {
            // Запит до глобального стану (напр. Redis), де зберігаються всі ID учасників
            return await this.state.getCountInNamespace(this.name)
        } catch (error) {
            this.logger?.error('Failed to get global member count', { error: error.message })
            return this._localSockets.size // Fallback до локальних даних
        }
    }

    /**
     * Реєстрація обробника подій неймспейсу (Proxy to PubSub)
     * @return {Namespace}
     * @example
     * namespace.on('room_created', (room) => {
     *     console.log('New room created:', room.name);
     * });
     */
    on(event, handler) {
        this.events.on(event, handler)
        return this
    }

    /**
     * Видалення обробника подій (Proxy to PubSub)
     * @return {Namespace}
     * @example
     * namespace.off('room_created', handlerFunction);
     */
    off(event, handler) {
        this.events.off(event, handler)
        return this
    }

    /**
     * Еміт події неймспейсу (Proxy to PubSub)
     * @return {Promise<void>}
     * @example
     * await namespace.emit('custom_event', { data: 'value' });
     */
    async emit(event, payload) {
        return await this.events.emit(event, payload)
    }

    /**
     * Registers connection middleware.
     * @param {function(import('./Socket.js').Socket, function): Promise<void>} fn
     * @returns {Namespace}
     * @example
     * namespace.use(async (socket, next) => {
     *     console.log('Socket connected:', socket.id);
     *     await next();
     * });
     */
    use(fn) {
        this.pipeline.use(fn)
        return this
    }

    /**
     * Sets up broker subscription for cluster-wide communication.
     * @private
     * @return {Promise<void>}
     */
    async _subscribeToBroker() {
        try {
            await this.broker.subscribe(this.topic, (packet) => {
                // Instance Echo Protection: ignore messages from our own node
                if (packet.serverId === this.serverId) {
                    return
                }

                const { userId, room, envelope } = packet

                if (userId) {
                    this._dispatchToLocalUser(userId, envelope)
                } else if (room) {
                    this.rooms.get(room)?.dispatch(envelope)
                } else {
                    this._dispatchToAllLocal(envelope)
                }
            })

            this.logger?.debug('Namespace broker subscription established')
        } catch (error) {
            this.logger.error('Namespace broker setup failed', { error: error.message })
        }
    }

    /**
     * Видаляє підписку на брокер при знищенні неймспейсу.
     * @private
     * @return {Promise<void>}
     */
    async _unsubscribeFromBroker() {
        try {
            await this.broker.unsubscribe(this.topic)
            this.logger?.debug('Namespace broker subscription removed')
        } catch (error) {
            this.logger?.error('Namespace broker unsubscribe failed', { error: error.message })
        }
    }

    /**
     * Ассоціює сокет з юзером.
     * @param {string} userId
     * @param {import('./Socket.js').Socket} socket
     * @returns {Promise<void>}
     * @example
     * await namespace.addUserSocket('user123', socket);
     */
    async addUserSocket(userId, socket) {
        if (!this._userToSockets.has(userId)) {
            this._userToSockets.set(userId, new Set())
        }
        this._userToSockets.get(userId).add(socket)

        this.logger?.debug('Socket associated with user', {
            socketId: socket.id,
            userId,
        })
    }

    /**
     * Оновлює асоціацію сокета з юзером (наприклад, після авторизації).
     * @param {import('./Socket.js').Socket} socket
     * @param {string} oldUserId - Старий ID користувача.
     * @returns {Promise<void>}
     * @example
     * await namespace.updateSocketIdentity(socket, 'guest_1234');
     */
    async updateSocketIdentity(socket, oldUserId) {
        if (this._isDestroyed) return

        // 1. Видаляємо стару прив'язку
        if (oldUserId && this._userToSockets.has(oldUserId)) {
            const userSockets = this._userToSockets.get(oldUserId)
            userSockets.delete(socket)
            if (userSockets.size === 0) {
                this._userToSockets.delete(oldUserId)
            }
        }

        // 2. Створюємо нову прив'язку
        const newUserId = socket.user.id
        if (!this._userToSockets.has(newUserId)) {
            this._userToSockets.set(newUserId, new Set())
        }
        this._userToSockets.get(newUserId).add(socket)

        this.logger.debug('Socket identity re-mapped', {
            oldUserId,
            newUserId,
            socketId: socket.id,
        })
    }

    /**
     * Реєструє сокет у неймспейсі.
     * @param {import('./Socket.js').Socket} socket
     */
    async addSocket(socket) {
        // Run connection middlewares
        try {
            const ctx = { socket, ns: this }

            // Прохід через ланцюжок middleware
            await this.pipeline.execute(ctx)

            // Якщо всі мідлвари пройдені успішно, реєструємо сокет
            this._localSockets.set(socket.id, socket)

            // Ассоціюємо сокет з юзером, якщо є інформація про користувача
            if (socket?.user?.id) {
                await this.addUserSocket(socket.user.id, socket)
            }

            this.logger?.debug('Socket added to namespace', {
                socketId: socket.id,
                userId: socket.user?.id,
            })
        } catch (error) {
            this.logger?.warn('Socket rejected by middleware', {
                socketId: socket.id,
                error: error.message,
            })
            socket.disconnect(4003, 'Forbidden')
        }
    }

    /**
     * Видаляє сокет з неймспейсу.
     * @param {import('./Socket.js').Socket} socket
     * @returns {Promise<void>}
     * @example
     * await namespace.removeSocket(socket);
     */
    async removeSocket(socket) {
        // Видаляємо з локальних сокетів
        this._localSockets.delete(socket.id)

        // Видаляємо з мапи юзера
        const userId = socket?.user?.id
        if (userId) {
            const userSockets = this._userToSockets.get(userId)
            if (userSockets) {
                userSockets.delete(socket)
                if (userSockets.size === 0) {
                    this._userToSockets.delete(userId)
                }
            }
        }

        // Автоматичний вихід з усіх кімнат
        const leavePromises = Array.from(socket.rooms).map((roomName) =>
            this.leaveRoom(roomName, socket).catch((error) =>
                this.logger?.error('Room exit error during socket removal', {
                    error: error.message,
                }),
            ),
        )

        await Promise.allSettled(leavePromises)
        this.logger?.debug('Socket session removed', { socketId: socket.id })
    }

    /**
     * Відправка повідомлення локальним сокетам конкретного юзера.
     * @param {string} userId
     * @param {MessageEnvelope} envelope
     * @return {void}
     * @private
     */
    _dispatchToLocalUser(userId, envelope) {
        const sockets = this._userToSockets.get(userId)

        if (!sockets) return

        for (const socket of sockets) {
            socket.rawSend(data)
        }
    }

    /**
     * Відправка повідомлення всім локальним сокетам у цьому неймспейсі.
     * @param {MessageEnvelope} envelope
     * @return {void}
     * @private
     */
    _dispatchToAllLocal(envelope) {
        for (const socket of this._localSockets.values()) {
            socket.rawSend(envelope)
        }
    }

    /**
     * Додає сокет до кімнати неймспейсу.
     * Якщо кімнати не існує, створює її.
     * @param {string} roomName
     * @param {import('./Socket.js').Socket} socket
     * @returns {Promise<void>}
     * @example
     * await namespace.joinRoom('chat_room', socket);
     */
    async joinRoom(roomName, socket) {
        let room = this.rooms.get(roomName)

        if (!room) {
            room = new Room(roomName, this)
            this.rooms.set(roomName, room)
            this.events.emit('room_created', room)
            this.logger?.info('New room created', { room: roomName })
        }

        await room.add(socket)
    }

    /**
     * Видаляє сокет з кімнати неймспейсу.
     * Якщо кімната порожня після виходу, видаляє її з реєстру.
     * @param {string} roomName
     * @param {import('./Socket.js').Socket} socket
     * @returns {Promise<void>}
     * @example
     * await namespace.leaveRoom('chat_room', socket);
     */
    async leaveRoom(roomName, socket) {
        const room = this.rooms.get(roomName)
        if (!room) return

        await room.remove(socket)

        if (room.isEmpty) {
            await room.destroy()

            this.rooms.delete(roomName)
            this.events.emit('room_destroyed', room)
            this.logger?.info('Room destroyed due to emptiness', { room: roomName })
        }
    }

    /**
     * Повертає API для розсилки в кімнату.
     * @param {string} roomName
     * @return {Object} Об'єкт з методом emit.
     * @example
     * namespace.to('room1').emit('event', { data: 'value' });
     */
    to(roomName) {
        return {
            emit: async (event, payload, senderId = null) => {
                const envelope = MessageEnvelope.create({
                    ns: this.name,
                    room: roomName,
                    event,
                    payload,
                    senderId: senderId,
                })

                const room = this.rooms.get(roomName)

                if (room) {
                    // Local delivery via Room
                    // room.dispatch(envelope)

                    // Global delivery via Room
                    await room.broadcast(envelope, senderId)
                }

                // await this.broker.publish(`broker:ns:${this.name}:room:${roomName}`, {
                //     serverId: this.serverId,
                //     room: roomName,
                //     envelope,
                // })
            },
        }
    }

    /**
     * Повертає API для розсилки конкретному юзеру на всі його пристрої.
     * @param {string} userId
     * @return {Object} Об'єкт з методом emit.
     * @example
     * namespace.toUser('user123').emit('event', { data: 'value' });
     */
    toUser(userId) {
        return {
            emit: async (event, payload) => {
                const envelope = MessageEnvelope.create({ ns: this.name, event, payload })

                // 1. Local delivery
                this._dispatchToLocalUser(userId, envelope)

                // 2. Global delivery via broker
                await this.broker.publish(`broker:ns:${this.name}:user:${userId}`, {
                    serverId: this.serverId,
                    userId,
                    envelope,
                })
            },
        }
    }

    /**
     * Розсилка повідомлення ВСІМ підключеним клієнтам у цьому неймспейсі (на всіх серверах).
     *
     * @param {string} event - Назва події.
     * @param {any} payload - Дані.
     * @param {string} [senderId='system'] - ID відправника.
     * @returns {Promise<void>}
     * @example
     * await namespace.broadcast('news', { headline: 'Breaking News!' });
     */
    async broadcast(event, payload, senderId = null) {
        const envelope = MessageEnvelope.create({
            ns: this.name,
            event,
            payload,
            sender: senderId,
        })

        // 1. Local delivery
        this._dispatchToAllLocal(envelope)

        // 2. Global delivery
        try {
            await this.broker.publish(`broker:ns:${this.name}:global`, {
                serverId: this.serverId,
                envelope,
            })
        } catch (error) {
            this.logger?.error('Global broadcast failed', { error: error.message })
        }
    }

    /**
     * Знищує неймспейс, очищаючи всі ресурси.
     * @returns {Promise<void>}
     */
    async destroy() {
        if (this._isDestroyed) return
        this._isDestroyed = true

        this.logger?.info('Destroying namespace...', {
            uptime: this.uptime,
            activeLocalSockets: this._localSockets.size,
        })

        // 1. Stop receiving new broker messages
        await this._unsubscribeFromBroker()

        // 2. Destroy all rooms (this triggers broker unsubs for rooms)
        for (const room of this.rooms.values()) {
            room.destroy()
        }
        this.rooms.clear()

        // 3. Disconnect all local sockets
        for (const socket of this._localSockets.values()) {
            socket.disconnect(1001, 'Namespace Destroyed')
        }
        this._localSockets.clear()

        // 4. Final internal cleanup
        this._userToSockets.clear()
        this.pipeline.clear()
        this.events.clear()

        //
        this.logger?.info('Namespace destroyed successfully')
    }
}
