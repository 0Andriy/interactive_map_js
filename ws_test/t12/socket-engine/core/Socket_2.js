import { MiniEventEmitter } from './MiniEventEmitter.js'
import { BroadcastOperator } from './BroadcastOperator.js'

export class Socket {
    constructor(namespace, conn, handshake = {}) {
        this.nsp = namespace
        this.conn = conn
        this.handshake = handshake
        this.id = conn.id || Math.random().toString(36).substring(2, 15)

        // Композитна шина для подій конкретного сокета
        this.events = new MiniEventEmitter()

        this._ackId = 0
        this._acks = new Map()

        this._setupTransport()
    }

    /**
     * Підписка на події сокета (socket.on('chat', ...), socket.on('disconnect'))
     */
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

    // --- КЕРУВАННЯ КІМНАТАМИ ТА ЖИТТЄВИМ ЦИКЛОМ (Аналог Socket.IO) ---

    /**
     * Вхід у кімнату. Емітить подійний кастомний івент 'join-room'.
     */
    join(room) {
        this.nsp.adapter.add(this.id, room)
        // В оригіналі подія join-room тригериться на сокеті
        this.events.emitWithContext('join-room', this, [room])
    }

    /**
     * Вихід з кімнати. Емітить подійний кастомний івент 'leave-room'.
     */
    leave(room) {
        this.nsp.adapter.del(this.id, room)
        // В оригіналі подія leave-room тригериться на сокеті
        this.events.emitWithContext('leave-room', this, [room])
    }

    /**
     * Повне відключення. Слідує стандартам: 'disconnecting' -> очищення -> 'disconnect'.
     */
    disconnect(closeTransport = false) {
        if (!this.nsp.sockets.has(this.id)) return

        // 1. Подія 'disconnecting' викликається ДО очищення кімнат в адаптері.
        // Це дозволяє розробнику всередині socket.on('disconnecting') прочитати, у яких кімнатах був юзер.
        const reason = 'server namespace disconnect'
        this.events.emitWithContext('disconnecting', this, [reason])

        // 2. Видаляємо сокет з пулу та чистимо адаптер
        this.nsp.sockets.delete(this.id)
        this.nsp.adapter.delAll(this.id)

        // 3. Подія 'disconnect' викликається ПІСЛЯ повного очищення
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
