import { Room } from './Room.js'
import { EventEmitter } from './EventEmitter.js'
import { MiddlewarePipeline } from './MiddlewarePipeline.js'

export class Namespace {
    #isDestroyed = false
    #brokerChannel = null
    #brokerUnsubscribe = null

    constructor(name, { server, stateAdapter, brokerAdapter, logger = null } = {}) {
        this.name = name
        this.server = server

        this.state = stateAdapter
        this.broker = brokerAdapter
        this.#brokerChannel = `ws:ns:${this.name}`

        this.logger = logger.child
            ? logger.child({
                  component: `${this.constructor.name}`,
                  nsName: this.name,
              })
            : logger

        this.sockets = new Map() // id -> Socket
        this.rooms = new Map() // name -> Room

        this.eventEmitter = new EventEmitter({ logger: this.logger })
        this.pipelineMiddleware = new MiddlewarePipeline({ logger: this.logger })

        this.createdAt = new Date()

        this.#initBroker()

        this.logger?.info?.(`[${this.constructor.name}] Namespace initialized`, {
            serverId: this.server.serverId,
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
                ns: this,
                socket,
            }

            await this.pipelineMiddleware.run(context)

            this.sockets.set(socket.id, socket)

            await this.state?.addClient(this.name, socket.id, { serverId: this.server.serverId })

            socket.rawSocket.on('close', () => this.removeSocket(socket.id))

            this.emit('connection', socket)
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
    removeSocket(socketId) {
        const socket = this.sockets.get(socketId)
        if (!socket) return

        // 1. Видалити сокет з усіх кімнат
        for (const roomName of [...socket.rooms]) {
            this.leaveRoom(roomName, socketId)
        }

        // 2. Видалити з реєстру
        this.sockets.delete(socketId)
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
        if (!room) {
            return
        }

        room.remove(socketId)

        if (room.isEmpty) {
            room.destroy()
            this.rooms.delete(roomName)
        }
    }

    /**
     * Глобальний еміт (Локально + Брокер)
     */
    broadcast(event, data, senderId = null) {
        this.localEmit(event, data, senderId)

        if (this.broker) {
            this.broker.publish(this.#brokerChannel, {
                from: this.server.serverId,
                nsName: this.name,
                event,
                data,
            })
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

        for (const socket of [...this.sockets.values()]) {
            socket.disconnect(1001, 'Namespace Destroyed')
        }
        this.sockets.clear()

        for (const room of [...this.sockets.values()]) {
            room.destroy()
        }
        this.rooms.clear()

        this.eventEmitter.destroy()
        this.pipelineMiddleware.destroy()
    }

    /* ===============================
     * Internal helpers
     * =============================== */

    #initBroker() {
        if (!this.broker) return

        // Зберігаємо функцію відписки, яку повертає брокер
        const result = this.broker.subscribe(this.#brokerChannel, (msg) => {
            if (this.#isDestroyed || msg.from === this.server.serverId) {
                return
            }

            this.localEmit(msg.event, msg.data, msg.senderId)
        })

        // Підтримка обох паттернів: повернення функції або метод .unsubscribe()
        if (typeof result === 'function') {
            this.#brokerUnsubscribe = result
        }
    }
}
