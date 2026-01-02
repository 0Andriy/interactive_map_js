import { PubSub } from './PubSub.js'
import { Room } from './Room.js'
import { MessageEnvelope } from './MessageEnvelope.js'

/**
 * @typedef {import('../interfaces/IStateAdapter.js').IStateAdapter} IStateAdapter
 * @typedef {import('../interfaces/IBrokerAdapter.js').IBrokerAdapter} IBrokerAdapter
 */

/**
 * @class Namespace
 * @classdesc Керує логікою групування сокетів, кімнат та маршрутизацією через брокер.
 */
export class Namespace extends PubSub {
    /**
     * @param {string} name - Ім'я неймспейсу.
     * @param {Object} deps - Залежності.
     * @param {IStateAdapter} deps.state
     * @param {IBrokerAdapter} deps.broker
     * @param {string} deps.serverId
     * @param {Object} deps.logger
     */
    constructor(name, deps) {
        super()
        this.name = name
        this.state = deps.state
        this.broker = deps.broker
        this.serverId = deps.serverId
        this.logger = deps.logger.child ? deps.logger.child({ ns: name }) : deps.logger

        /** @type {Map<string, import('./Socket.js').Socket>} */
        this.localSockets = new Map()

        /**
         * Оптимізація для швидкого пошуку сокетів юзера O(1)
         * @type {Map<string, Set<import('./Socket.js').Socket>>}
         */
        this._userToSockets = new Map()

        /** @type {Map<string, Room>} */
        this.rooms = new Map()

        this.middlewares = []

        this._setupBroker()
    }

    use(fn) {
        this.middlewares.push(fn)
    }

    async _runMiddlewares(socket) {
        let index = 0
        const next = async () => {
            if (index < this.middlewares.length) {
                await this.middlewares[index++](socket, next)
            }
        }
        await next()
    }

    /**
     * Налаштування підписки брокера для міжсерверної взаємодії.
     * @private
     */
    async _setupBroker() {
        // Підписка на події неймспейсу (глобальні, кімнати, юзери)
        const pattern = `broker:${this.name}:*`

        await this.broker.subscribe(pattern, (packet) => {
            // Ігноруємо повідомлення від самих себе
            if (packet.originId === this.serverId) return

            const { userId, room, envelope } = packet

            if (userId) {
                this._dispatchToLocalUser(userId, envelope)
            } else if (room) {
                this.rooms.get(room)?.dispatch(envelope)
            } else {
                this.localSockets.forEach((s) => s.rawSend(envelope))
            }
        })
    }

    /**
     * Реєструє сокет у неймспейсі.
     * @param {import('./Socket.js').Socket} socket
     */
    addSocket(socket) {
        this.localSockets.set(socket.id, socket)

        if (socket.user?.id) {
            if (!this._userToSockets.has(socket.user.id)) {
                this._userToSockets.set(socket.user.id, new Set())
            }
            this._userToSockets.get(socket.user.id).add(socket)
        }
    }

    /**
     * Відправка повідомлення локальним сокетам конкретного юзера.
     * @private
     */
    _dispatchToLocalUser(userId, envelope) {
        const sockets = this._userToSockets.get(userId)
        if (sockets) {
            sockets.forEach((s) => s.rawSend(envelope))
        }
    }

    /**
     * Вхід сокета в кімнату.
     * @param {string} roomName
     * @param {import('./Socket.js').Socket} socket
     */
    async joinRoom(roomName, socket) {
        let room = this.rooms.get(roomName)

        if (!room) {
            room = new Room(roomName, this)
            this.rooms.set(roomName, room)
            await this.emit('room_created', room)
        }

        await room.add(socket)
    }

    /**
     * Повертає API для розсилки в кімнату.
     * @param {string} roomName
     */
    to(roomName) {
        return {
            emit: async (event, payload, senderId = null) => {
                const envelope = MessageEnvelope.create({
                    ns: this.name,
                    room: roomName,
                    event,
                    payload,
                    sender: senderId,
                })

                // Глобальна розсилка через брокер
                await this.broker.publish(`broker:${this.name}:room:${roomName}`, {
                    originId: this.serverId,
                    room: roomName,
                    envelope,
                })

                // Локальна розсилка
                this.rooms.get(roomName)?.dispatch(envelope)
            },
        }
    }

    /**
     * Повертає API для розсилки конкретному юзеру на всі його пристрої.
     * @param {string} userId
     */
    toUser(userId) {
        return {
            emit: async (event, payload) => {
                const envelope = MessageEnvelope.create({ ns: this.name, event, payload })

                // 1. Локальна доставка
                this._dispatchToLocalUser(userId, envelope)

                // 2. Доставка через брокер іншим нодам
                await this.broker.publish(`broker:${this.name}:user:${userId}`, {
                    originId: this.serverId,
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
     */
    async broadcast(event, payload, senderId = 'system') {
        const envelope = MessageEnvelope.create({
            ns: this.name,
            event,
            payload,
            sender: senderId,
        })

        // 1. Локальна розсилка (на поточному сервері)
        // Використовуємо ітератор для уникнення створення великих проміжних масивів
        for (const socket of this.localSockets.values()) {
            socket.rawSend(envelope)
        }

        // 2. Глобальна розсилка через брокер (для інших серверів)
        // Використовуємо спеціальний топік :global
        try {
            await this.broker.publish(`broker:${this.name}:global`, {
                originId: this.serverId,
                envelope,
            })
        } catch (error) {
            this.logger.error(`Failed to publish global message to broker: ${error.message}`)
        }
    }

    /**
     * Видалення сокета з усіх структур неймспейсу.
     * @param {import('./Socket.js').Socket} socket
     */
    async _removeSocket(socket) {
        this.localSockets.delete(socket.id)

        if (socket.user?.id) {
            const userSockets = this._userToSockets.get(socket.user.id)
            if (userSockets) {
                userSockets.delete(socket)
                if (userSockets.size === 0) this._userToSockets.delete(socket.user.id)
            }
        }

        const leavePromises = Array.from(socket.rooms).map((roomName) =>
            this.leaveRoom(roomName, socket),
        )
        await Promise.allSettled(leavePromises)
    }

    _removeRoom(roomName) {
        const room = this.rooms.get(roomName)
        if (room) {
            this.emit('room_destroyed', room)
            this.rooms.delete(roomName)
        }
    }
}
