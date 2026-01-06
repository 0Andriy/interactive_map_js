export class Room {
    #isDestroyed = false
    #brokerChannel = null
    #brokerUnsubscribe = null

    constructor(name, namespace, logger = null) {
        this.name = name
        this.namespace = namespace
        this.logger = logger.child
            ? logger.child({
                  component: `${this.constructor.name}`,
                  roomName: this.name,
              })
            : logger

        this.#brokerChannel = `ws:ns:${this.namespace.name}:room:${this.name}`

        this.sockets = new Set()
        this.createdAt = new Date()

        this.#initBroker()

        this.logger?.debug?.(`[${this.constructor.name}] Room created: ${this.name}`, {
            ns: this.namespace.name,
            channel: this.#brokerChannel,
        })
    }

    /* ===============================
     * Getters
     * =============================== */

    get size() {
        return this.sockets.size
    }

    get isEmpty() {
        return this.sockets.size === 0
    }

    /* ===============================
     * Public API
     * =============================== */

    /**
     * Додати сокет до кімнати.
     * @param {Socket} socket - Об'єкт сокета для додавання.
     */
    add(socket) {
        if (this.#isDestroyed) return
        if (this.sockets.has(socket)) return

        this.sockets.add(socket)

        socket.rooms.add(this.name)

        this.logger?.debug?.(`[${this.constructor.name}] Socket ${socket.id} joined ${this.name}`)
    }

    /**
     * Видалити сокет із кімнати.
     * @param {string} socketId - Ідентифікатор сокета.
     */
    remove(socketId) {
        const socket = this.namespace.sockets.get(socketId)
        if (!socket) return

        this.sockets.delete(socket)
        socket.rooms.delete(this.name)

        this.logger?.debug?.(`[${this.constructor.name}] Socket ${socketId} left ${this.name}`)
    }

    /**
     * Надіслати повідомлення всім учасникам кімнати (локально + через брокер).
     * @param {string} event - Назва події.
     * @param {any} data - Дані повідомлення.
     * @param {string|null} [senderId=null] - ID відправника для Echo Protection.
     */
    broadcast(event, data, senderId = null) {
        if (this.#isDestroyed) return

        // 1. Рассылаем локальным участникам на этом инстансе
        this.localEmit(event, data, senderId)

        // 2. Публикуем в брокер для других инстансов
        if (this.namespace.broker) {
            this.namespace.broker.publish(this.#brokerChannel, {
                from: this.namespace.server.serverId,
                roomName: this.name,
                senderId,
                event,
                data,
            })
        }
    }

    /**
     * Надіслати повідомлення тільки локальним клієнтам на цьому сервері.
     * @param {string} event - Назва події.
     * @param {any} data - Дані повідомлення.
     * @param {string|null} [senderId=null] - ID відправника для ігнорування.
     */
    localEmit(event, data, senderId = null) {
        if (this.#isDestroyed) return

        const payload = {
            event,
            data,
            ns: this.namespace.name,
            room: this.name,
        }

        for (const socket of this.sockets) {
            // Echo protection
            if (senderId && socket.id === senderId) {
                continue
            }

            socket.send(payload)
        }
    }

    getLocalMembers() {
        return Array.from(this.sockets).map((s) => s.id)
    }

    async getGlobalMembers() {
        if (!this.namespace.state) {
            return this.getLocalMembers()
        }
        // Припускаємо, що stateAdapter має метод getRoomMembers
        return await this.namespace.state.getRoomMembers(this.namespace.name, this.name)
    }

    /**
     * Повне знищення об'єкта кімнати та очищення підписок.
     */
    async destroy() {
        if (this.#isDestroyed) return
        this.#isDestroyed = true

        // Відписка від брокера для запобігання витоку пам'яті
        if (this.#brokerUnsubscribe) {
            try {
                await this.#brokerUnsubscribe()
            } catch (error) {
                this.logger?.error?.(`[${this.constructor.name}] Broker unsubscribe failed`, error)
            }
        }

        // Очищення посилань у сокетів на цю кімнату
        for (const socket of this.sockets) {
            socket.rooms.delete(this.name)
        }

        this.sockets.clear()
        this.logger?.debug?.(`[${this.constructor.name}] Destroyed: ${this.name}`)
    }

    /* ===============================
     * Internal
     * =============================== */

    #initBroker() {
        if (!this.namespace.broker) return

        const result = this.namespace.broker.subscribe(this.#brokerChannel, (msg) => {
            // Ігноруємо повідомлення, якщо кімната знищена або повідомлення від нас самих
            if (this.#isDestroyed || msg.from === this.namespace.server.serverId) {
                return
            }

            this.localEmit(msg.event, msg.data, msg.senderId)
        })

        if (typeof result === 'function') {
            this.#brokerUnsubscribe = result
        }
    }
}
