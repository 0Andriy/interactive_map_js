import { InMemoryAdapter } from './InMemoryAdapter.js'

export class RedisAdapter extends InMemoryAdapter {
    constructor(namespace, pubClient, subClient, opts = {}) {
        super(namespace)

        this.pubClient = pubClient
        this.subClient = subClient
        this.channel = opts.key || 'socket.io'
        this.uid = Math.random().toString(36).substring(2, 15)
        this._requests = new Map()

        // Словник обробників: приймає вже ДЕСЕРІАЛІЗОВАНІ (чисті) дані data
        this._handlers = {
            broadcast: (data) => super.broadcast(data.packet, data.opts),
            socketsJoin: (data) => super.socketsJoin(data.opts, data.rooms),
            socketsLeave: (data) => super.socketsLeave(data.opts, data.rooms),
            disconnectSockets: (data) => super.disconnectSockets(data.opts, data.close),
            fetchSocketsRequest: (data, msgId) => this._handleFetchRequest(msgId, data.opts),
            fetchSocketsResponse: (data, msgId) => this._handleFetchResponse(msgId, data.sockets),
        }

        this._setupRequestChannel()
    }

    async _setupRequestChannel() {
        await this.subClient.subscribe(this.channel, (message) => {
            try {
                // 1. ДЕСЕРІАЛІЗАЦІЯ НА ВХОДІ
                const request = JSON.parse(message)

                if (request.origin === this.uid) return // Ігноруємо себе

                const handler = this._handlers[request.type]
                if (handler) {
                    handler(request.data, request.msgId)
                }
            } catch (err) {
                // Захист від зламаних пакетів
            }
        })
    }

    /**
     * Допоміжний приватний метод, щоб не дублювати JSON.stringify та pubClient.publish
     * @private
     */
    _publish(type, data, msgId = null) {
        // СЕРІАЛІЗАЦІЯ НА ВИХОДІ: об'єкт перетворюється на рядок безпосередньо перед Redis
        const payload = JSON.stringify({
            type,
            origin: this.uid,
            msgId,
            data,
        })
        this.pubClient.publish(this.channel, payload)
    }

    // --- МЕТОДИ З СЕРІАЛІЗАЦІЄЮ ---

    broadcast(packet, opts = {}) {
        super.broadcast(packet, opts) // Локально
        this._publish('broadcast', { packet, opts }) // В кластер
    }

    async socketsJoin(opts, rooms) {
        super.socketsJoin(opts, rooms)
        this._publish('socketsJoin', { opts, rooms })
    }

    async socketsLeave(opts, rooms) {
        super.socketsLeave(opts, rooms)
        this._publish('socketsLeave', { opts, rooms })
    }

    async disconnectSockets(opts, close = false) {
        super.disconnectSockets(opts, close)
        this._publish('disconnectSockets', { opts, close })
    }

    async fetchSockets(opts = {}) {
        const localSockets = await super.fetchSockets(opts)
        const cleanLocal = localSockets.map((s) => ({
            id: s.id,
            handshake: s.handshake || {},
            rooms: Array.from(this.sids.get(s.id) || []),
        }))

        const msgId = Math.random().toString(36).substring(2, 15)

        // Публікуємо запит у кластер
        this._publish('fetchSocketsRequest', { opts }, msgId)

        return new Promise((resolve) => {
            const responses = [...cleanLocal]
            const timeout = setTimeout(() => {
                this._requests.delete(msgId)
                resolve(responses)
            }, 1000)

            this._requests.set(msgId, { responses, timeout, resolve })
        })
    }

    async _handleFetchRequest(msgId, opts) {
        const localSockets = await super.fetchSockets(opts)
        const serializedSockets = localSockets.map((s) => ({
            id: s.id,
            handshake: s.handshake || {},
            rooms: Array.from(this.sids.get(s.id) || []),
        }))

        // Відправляємо відповідь конкретній ноді
        this._publish('fetchSocketsResponse', { sockets: serializedSockets }, msgId)
    }

    _handleFetchResponse(msgId, remoteSockets) {
        const request = this._requests.get(msgId)
        if (!request) return
        request.responses.push(...remoteSockets)
    }
}
