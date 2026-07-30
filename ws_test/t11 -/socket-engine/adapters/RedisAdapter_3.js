// src/adapters/RedisAdapter.js
import { BaseAdapter } from './BaseAdapter.js'
import crypto from 'crypto'

export class RedisAdapter extends BaseAdapter {
    // Конструктор тепер приймає підготовлені pub/sub клієнти
    constructor(namespace, pubClient, subClient) {
        super(namespace)

        this.pubClient = pubClient
        this.subClient = subClient

        this.rooms = new Map()
        this.sids = new Map()

        this.nodeId = crypto.randomUUID()

        // Канали ізольовані під конкретний Namespace
        this.msgChannel = `ws-bridge:${this.ns.name}:msg`
        this.requestChannel = `ws-bridge:${this.ns.name}:req`
        this.responseChannel = `ws-bridge:${this.ns.name}:res`

        this.pendingRequests = new Map()

        this.initRedis()
    }

    initRedis() {
        // Підписуємо спільний subClient на канали цього namespace
        this.subClient.subscribe(this.msgChannel, this.requestChannel, this.responseChannel)

        this.subClient.on('message', (channel, message) => {
            try {
                const data = JSON.parse(message)

                if (channel === this.msgChannel) {
                    this.handleBroadcastMessage(data)
                } else if (channel === this.requestChannel) {
                    this.handleRpcRequest(data)
                } else if (channel === this.responseChannel) {
                    this.handleRpcResponse(data)
                }
            } catch (e) {
                this.ns.emit('error', e)
            }
        })
    }

    addAll(id, rooms) {
        if (!this.sids.has(id)) this.sids.set(id, new Set())
        for (const room of rooms) {
            if (!this.rooms.has(room)) this.rooms.set(room, new Set())
            this.rooms.get(room).add(id)
            this.sids.get(id).add(room)
        }
    }

    del(id, room) {
        if (this.rooms.has(room)) {
            this.rooms.get(room).delete(id)
            if (this.rooms.get(room).size === 0) this.rooms.delete(room)
        }
        if (this.sids.has(id)) {
            this.sids.get(id).delete(room)
            if (this.sids.get(id).size === 0) this.sids.delete(id)
        }
    }

    delAll(id) {
        const socketRooms = this.sids.get(id)
        if (!socketRooms) return
        for (const room of socketRooms) {
            if (this.rooms.has(room)) {
                this.rooms.get(room).delete(id)
                if (this.rooms.get(room).size === 0) this.rooms.delete(room)
            }
        }
        this.sids.delete(id)
    }

    broadcast(packet, opts = {}) {
        if (opts.flags && opts.flags.local) {
            this.localBroadcast(packet, opts)
            return
        }

        const payload = JSON.stringify({
            fromNode: this.nodeId,
            packet,
            opts,
        })

        this.pubClient.publish(this.msgChannel, payload)
    }

    handleBroadcastMessage(data) {
        this.localBroadcast(data.packet, data.opts)
    }

    localBroadcast(packet, opts = {}) {
        const { except = [], rooms = [] } = opts
        const targets = new Set()

        if (rooms.length > 0) {
            for (const room of rooms) {
                const clients = this.rooms.get(room)
                if (clients) clients.forEach((id) => targets.add(id))
            }
        } else {
            this.ns.sockets.forEach((_, id) => targets.add(id))
        }

        except.forEach((id) => targets.delete(id))

        for (const id of targets) {
            const socket = this.ns.sockets.get(id)
            if (socket) socket.sendRaw(packet)
        }
    }

    async fetchSockets(opts = {}) {
        const localSocketIds = this.localFetchSocketIds(opts)
        const localSocketsData = localSocketIds
            .map((id) => {
                const socket = this.ns.sockets.get(id)
                return socket ? this.mapSocketToMetadata(socket) : null
            })
            .filter(Boolean)

        if (opts.flags && opts.flags.local) {
            return localSocketsData
        }

        return new Promise((resolve) => {
            const requestId = crypto.randomUUID()
            const requestPayload = JSON.stringify({ requestId, fromNode: this.nodeId, opts })
            const responses = [localSocketsData]

            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId)
                resolve(responses.flat())
            }, 250)

            this.pendingRequests.set(requestId, { responses, timeout, resolve })
            this.pubClient.publish(this.requestChannel, requestPayload)
        })
    }

    handleRpcRequest(data) {
        if (data.fromNode === this.nodeId) return

        const matchedIds = this.localFetchSocketIds(data.opts)
        const socketsMetadata = matchedIds
            .map((id) => {
                const socket = this.ns.sockets.get(id)
                return socket ? this.mapSocketToMetadata(socket) : null
            })
            .filter(Boolean)

        const responsePayload = JSON.stringify({
            requestId: data.requestId,
            fromNode: this.nodeId,
            sockets: socketsMetadata,
        })

        this.pubClient.publish(this.responseChannel, responsePayload)
    }

    handleRpcResponse(data) {
        const requestContext = this.pendingRequests.get(data.requestId)
        if (!requestContext) return
        requestContext.responses.push(data.sockets)
    }

    localFetchSocketIds(opts = {}) {
        const { rooms = [], except = [] } = opts
        const targets = new Set()

        if (rooms.length > 0) {
            for (const room of rooms) {
                const clients = this.rooms.get(room)
                if (clients) clients.forEach((id) => targets.add(id))
            }
        } else {
            this.ns.sockets.forEach((_, id) => targets.add(id))
        }

        except.forEach((id) => targets.delete(id))
        return Array.from(targets)
    }

    mapSocketToMetadata(socket) {
        return {
            id: socket.id,
            handshake: socket.handshake,
            connectedAt: socket.connectedAt,
            rooms: Array.from(socket.rooms),
        }
    }
}

// ФАБРИКА ДЛЯ DI: Повертає анонімний замикаючий клас, адаптований під інтерфейс ядра
export function createRedisAdapter(pubClient, subClient) {
    return class extends RedisAdapter {
        constructor(namespace) {
            super(namespace, pubClient, subClient)
        }
    }
}
