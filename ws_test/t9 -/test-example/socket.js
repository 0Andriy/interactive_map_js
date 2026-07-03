import { EventEmitter } from 'events'
import { BroadcastOperator } from './broadcast-operator.js'

export class Socket {
    constructor(id, nsp, ws, handshake = {}, heartbeatManager = null) {
        this.id = id
        this.sessionId = handshake.query?.sid || Math.random().toString(36).substring(2, 15)
        this.nsp = nsp
        this.ws = ws
        this.handshake = handshake

        this.rooms = new Set()
        this.emitter = new EventEmitter()
        this.acks = new Map()
        this.ackId = 0
        this.missedPacketsBuffer = []

        this.heartbeatManager = heartbeatManager

        this._onMessageRef = (data) => this.onMessage(data)
        this._onCloseRef = () => this.onClose()

        this.ws.on('message', this._onMessageRef)
        this.ws.on('close', this._onCloseRef)

        this.join(this.id)

        if (this.heartbeatManager) {
            this.heartbeatManager.register(this)
        }
    }

    on(ev, fn) {
        this.emitter.on(ev, fn)
        return this
    }
    once(ev, fn) {
        this.emitter.once(ev, fn)
        return this
    }
    off(ev, fn) {
        this.emitter.off(ev, fn)
        return this
    }

    join(room) {
        this.rooms.add(room)
        this.nsp.adapter.addAll(this.id, [room])
    }

    leave(room) {
        this.rooms.delete(room)
        this.nsp.adapter.del(this.id, room)
    }

    packet(pkg) {
        if (this.ws && this.ws.readyState === 1) {
            this.ws.send(JSON.stringify(pkg))
        } else {
            this.missedPacketsBuffer.push(pkg)
            if (this.missedPacketsBuffer.length > 100) this.missedPacketsBuffer.shift()
        }
    }

    emit(ev, ...args) {
        const packet = { type: 'event', data: [ev] }
        const lastArg = args[args.length - 1]

        if (typeof lastArg === 'function') {
            const callback = args.pop()
            const id = ++this.ackId
            this.acks.set(id, callback)
            packet.ackId = id
        }

        packet.data.push(...args)
        this.packet(packet)
    }

    to(room) {
        return new BroadcastOperator(this.nsp.adapter, new Set([room]), new Set([this.id]))
    }

    onMessage(rawData) {
        try {
            if (this.heartbeatManager) {
                this.heartbeatManager.handleActivity(this)
            }

            const pkg = JSON.parse(rawData.toString())

            if (pkg.type === 'ack' && pkg.ackId) {
                const callback = this.acks.get(pkg.ackId)
                if (callback) {
                    callback(...pkg.data)
                    this.acks.delete(pkg.ackId)
                }
                return
            }

            if (pkg.type === 'event') {
                const [ev, ...args] = pkg.data

                if (pkg.ackId) {
                    const ackResponse = (...replyArgs) => {
                        this.packet({ type: 'ack', ackId: pkg.ackId, data: replyArgs })
                    }
                    args.push(ackResponse)
                }

                this.emitter.emit(ev, ...args)
            }
        } catch (e) {}
    }

    onClose() {
        this.emitter.emit('disconnecting')
        this.destroy()
    }

    destroy(reason = 'transport close') {
        if (this.heartbeatManager) {
            this.heartbeatManager.unregister(this)
            this.heartbeatManager = null
        }

        if (this.ws) {
            this.ws.off('message', this._onMessageRef)
            this.ws.off('close', this._onCloseRef)
            if (this.ws.readyState === 1) this.ws.close()
            this.ws = null
        }

        this.emitter.emit('disconnect', reason)
        this.nsp.adapter.delAll(this.id)
        this.nsp.sockets.delete(this.id)
        this.emitter.removeAllListeners()
        this.acks.clear()
    }
}
