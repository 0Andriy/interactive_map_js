import { Room } from './Room.js'
import { EventEmitter } from './EventEmitter.js'
import { MiddlewarePipeline } from './MiddlewarePipeline.js'

export class Namespace {
    #isDestroyed = false
    #brokerChannel = null
    #brokerUnsubscribe = null

    constructor(name, { serverId, stateAdapter, brokerAdapter, logger = null }) {
        this.name = name
        this.serverId = serverId

        this.state = stateAdapter
        this.broker = brokerAdapter
        this.#brokerChannel = `ws:ns:${this.name}`

        this.logger = logger.child
            ? logger.child({
                  component: `${this.constructor.name}`,
                  nsName: this.name,
              })
            : logger

        this.sockets = new Map() // socketId -> Socket
        this.rooms = new Map() // nameRoom -> Room
        this.users = new Map() // userId -> Set of SocketIds

        this.eventEmitter = new EventEmitter({ logger: this.logger })
        this.pipelineMiddleware = new MiddlewarePipeline({ logger: this.logger })

        this.createdAt = new Date()

        this.#initBroker()

        this.logger?.info?.(`[${this.constructor.name}] Namespace initialized`, {
            serverId: this.serverId,
            brokerChannel: this.#brokerChannel,
        })
    }

    /* ===============================
     * Getters
     * =============================== */

    get uptime() {
        return Date.now() - this.createdAt.getTime()
    }

    get isEmpty() {
        return this.sockets.size === 0
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
        return await this.eventEmitter.emit(event, payload)
    }

    use(fn) {
        this.pipelineMiddleware.use(fn)
        return this
    }

    /**
     * Додати сокет в неймспейс
     */
    async addSocket(socket) {
        if (this.#isDestroyed) return
        if (this.sockets.has(socket.id)) return

        try {
            const context = {
                socket,
                ns: this,
            }

            await this.pipelineMiddleware.run(context)

            this.sockets.set(socket.id, socket)

            const userId = socket?.user?.id
            if (userId) {
                this.addUserSocket(userId, socket.id)
            }

            await this.state?.addClient(this.name, socket.id, { serverId: this.serverId })

            socket.rawSocket.on('close', () => {
                this.removeSocket(socket.id)
            })

            this.emit('connection', socket)

            this.logger?.debug?.(`[${this.constructor.name}] Socket added to namespace`, {
                socketId: socket.id,
                userId: socket.user?.id,
            })
        } catch (error) {
            this.logger?.warn?.(`[${this.constructor.name}] Socket rejected by middleware`, {
                socketId: socket.id,
                error: error.message,
            })
            socket.disconnect(4003, 'Forbidden')
        }
    }

    /**
     * Видалити сокет звідусіль (викликається при close)
     */
    async removeSocket(socketId) {
        const socket = this.sockets.get(socketId)
        if (!socket) return

        const userId = socket?.user?.id
        if (userId) {
            this.removeUserSocket(userId, socketId)
        }

        // 1. Видалити сокет з усіх кімнат
        for (const roomName of [...socket.rooms]) {
            this.leaveRoom(roomName, socketId)
        }

        await this.state?.removeClient(this.name, socketId)

        // 2. Видалити з реєстру
        this.sockets.delete(socketId)
    }

    addUserSocket(userId, socketId) {
        let userSocketIds = this.users.get(userId)
        if (!userSocketIds) {
            userSocketIds = new Set()
            this.users.set(userId, userSocketIds)
        }
        userSocketIds.add(socketId)
    }

    removeUserSocket(userId, socketId) {
        const userSocketId = this.users.get(userId)
        if (userSocketId) return

        userSocketId.remove(socketId)

        if (userSocketId.size === 0) {
            this.users.delete(userId)
        }
    }

    /**
     * Приєднати сокет до кімнати за ID
     */
    joinRoom(roomName, socketId) {
        const socket = this.sockets.get(socketId)
        if (!socket) return

        let room = this.rooms.get(roomName)
        if (!room) {
            room = new Room(roomName, this, this.logger)
            this.rooms.set(roomName, room)
        }
        room.add(socket)
    }

    leaveRoom(roomName, socketId) {
        const room = this.rooms.get(roomName)
        if (!room) return

        room.remove(socketId)

        if (room.isEmpty) {
            room.destroy()
            this.rooms.delete(roomName)
        }
    }

    /**
     * Глобальний еміт (Локально + Брокер) - emit
     */
    async broadcast(event, data, senderId = null) {
        if (!event) {
            this.logger?.error?.(
                `[${this.constructor.name}] Broadcast failed: event name is required`,
            )
            return
        }

        // 1. Локальна розсилка всім підключеним до цього вузла
        try {
            await this.localEmit(event, data, senderId)
        } catch (error) {
            this.logger?.error?.(`[${this.constructor.name}] Local dispatch error`, {
                error,
                event,
            })
        }

        // 2. Публікація в брокер для інших вузлів кластера
        if (this.broker) {
            try {
                await this.broker.publish(this.#brokerChannel, {
                    fromServerId: this.serverId,
                    nsName: this.name,
                    event,
                    data,
                    senderId,
                })
            } catch (error) {
                this.logger?.error?.(`[${this.constructor.name}] Broker publish error`, {
                    error,
                    channel: this.#brokerChannel,
                })
            }
        }
    }

    to(roomName) {
        return {
            emit: (event, payload) => {
                const room = this.rooms.get(roomName)
                if (!room) return

                room.broadcast(event, payload)
            },
        }
    }

    toUser(userId) {
        return {
            emit: async (event, data) => {
                // 1. Локальна відправка на всі сокети цього юзера на цьому сервері
                const socketIds = this.users.get(userId)
                if (socketIds) {
                    for (const sId of socketIds) {
                        this.sockets.get(sId)?.send({ event, data, ns: this.name })
                    }
                }

                // 2. Публікація в брокер, щоб інші сервери зробили те саме
                if (this.broker) {
                    await this.broker.publish(this.#brokerChannel, {
                        fromServerId: this.serverId,
                        type: 'USER_BROADCAST',
                        userId,
                        event,
                        data,
                    })
                }
            },
        }
    }

    /**
     * Відправити всім локальним клієнтам неймспейсу
     */
    localEmit(event, data, senderId = null) {
        const payload = {
            event,
            data,
            ns: this.name,
        }

        for (const socket of this.sockets.values()) {
            if (senderId && socket.id === senderId) {
                continue
            }

            socket.send(payload)
        }
    }

    getLocalClients() {
        return Array.from(this.sockets.keys())
    }

    async getGlobalClients() {
        if (!this.state) return this.getLocalClients()
        return await this.state.getNamespaceClients(this.name)
    }

    /**
     * Очищення неймспейсу
     */
    async destroy() {
        if (this.#brokerUnsubscribe) {
            try {
                await this.#brokerUnsubscribe()
                this.logger?.debug?.(
                    `[${this.constructor.name}] Broker unsubscribed via cleanup function`,
                )
            } catch (error) {
                this.logger?.error?.(
                    `[${this.constructor.name}] Broker cleanup function failed`,
                    error,
                )
            }
        }

        for (const room of [...this.rooms.values()]) {
            room.destroy()
        }
        this.rooms.clear()

        for (const socket of [...this.sockets.values()]) {
            socket.disconnect(1001, 'Namespace Destroyed')
        }
        this.sockets.clear()

        this.eventEmitter.destroy()
        this.pipelineMiddleware.destroy()

        this.logger?.debug?.(`[${this.constructor.name}] Namespace destroyed: ${this.name}`, {
            nsName: this.name,
        })
        this.logger = null
    }

    /* ===============================
     * Internal helpers
     * =============================== */

    async #initBroker() {
        if (!this.broker) return

        // Зберігаємо функцію відписки, яку повертає брокер
        const result = await this.broker.subscribe(this.#brokerChannel, (msg) => {
            if (this.#isDestroyed) return
            // Echo Protection: ігноруємо власні повідомлення
            if (msg.fromServerId && msg.fromServerId === this.serverId) return

            this.localEmit(msg.event, msg.data, msg.senderId)
        })

        // Підтримка обох паттернів: повернення функції або метод .unsubscribe()
        if (typeof result === 'function') {
            this.#brokerUnsubscribe = result
        }
    }
}
