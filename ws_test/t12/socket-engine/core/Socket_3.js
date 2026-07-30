import { MiniEventEmitter } from './MiniEventEmitter.js'
import { BroadcastOperator } from './BroadcastOperator.js'

export class Socket {
    /**
     * @param {Namespace} namespace
     * @param {Object} conn - Екземпляр ConnWrapper
     * @param {Object} handshake - Дані хендшейку з Server (включаючи id: UUID)
     */
    constructor(namespace, conn, handshake) {
        this.nsp = namespace
        this.conn = conn
        this.handshake = handshake

        // Використовуємо UUID, який згенерував сервер на етапі upgrade
        this.id = handshake.id

        // Композитна шина подій бізнес-рівня сокета
        this.events = new MiniEventEmitter()

        this._ackId = 0
        this._acks = new Map()

        this._setupTransport()
    }

    on(event, callback) {
        this.events.on(event, callback)
        return this
    }

    off(event, callback) {
        this.events.off(event, callback)
        return this
    }

    /** @private */
    _setupTransport() {
        this.conn.on('message', (rawMessage) => {
            try {
                const packet = JSON.parse(rawMessage)
                this._onPacket(packet)
            } catch (err) {}
        })

        this.conn.on('close', () => {
            this.disconnect(false)
        })
    }

    /** @private */
    _onPacket(packet) {
        if (packet.type === 'ack') {
            const callback = this._acks.get(packet.id)
            if (callback) {
                this._acks.delete(packet.id)
                callback(...packet.data)
            }
            return
        }

        if (packet.type === 'event') {
            const [event, ...args] = packet.data

            if (packet.id !== undefined) {
                const ackCallback = (...replyArgs) => {
                    this.sendRaw({ type: 'ack', id: packet.id, data: replyArgs })
                }
                this.events.emitWithContext(event, this, [...args, ackCallback])
            } else {
                this.events.emitWithContext(event, this, args)
            }
        }
    }

    emit(event, ...args) {
        const hasCallback = typeof args[args.length - 1] === 'function'
        const callback = hasCallback ? args.pop() : null

        const packet = { type: 'event', data: [event, ...args] }

        if (callback) {
            const id = this._ackId++
            this._acks.set(id, callback)
            packet.id = id
        }

        this.sendRaw(packet)
    }

    sendRaw(packet) {
        if (this.conn && typeof this.conn.send === 'function') {
            this.conn.send(JSON.stringify(packet))
        }
    }

    join(room) {
        this.nsp.events.emitWithContext('adapter_add', this.nsp, [this.id, room])
        this.events.emitWithContext('join-room', this, [room])
    }

    leave(room) {
        this.nsp.events.emitWithContext('adapter_del', this.nsp, [this.id, room])
        this.events.emitWithContext('leave-room', this, [room])
    }

    disconnect(closeTransport = false) {
        if (!this.nsp.sockets.has(this.id)) return

        const reason = 'server namespace disconnect'
        this.events.emitWithContext('disconnecting', this, [reason])

        this.nsp.sockets.delete(this.id)
        this.nsp.events.emitWithContext('adapter_del_all', this.nsp, [this.id])

        this.events.emitWithContext('disconnect', this, [reason])

        if (closeTransport && typeof this.conn.close === 'function') {
            this.conn.close()
        }
    }

    to(room) {
        return new BroadcastOperator(this.nsp.adapter).to(room).except(this.id)
    }
    in(room) {
        return this.to(room)
    }
}
