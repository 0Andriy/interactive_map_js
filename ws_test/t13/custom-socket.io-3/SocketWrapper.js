import crypto from 'crypto'
import { EventEmitter } from './EventEmitter.js'
import { BroadcastOperator } from './BroadcastOperator.js'

export class SocketWrapper extends EventEmitter {
    constructor(ws, namespace, handshakeData) {
        super()
        this.ws = ws
        this.namespace = namespace
        this.id = crypto.randomUUID()
        this.handshake = handshakeData
        this.rooms = new Set()
        this.user = null

        this.join(this.id)
        this._listenToWire()
    }

    _listenToWire() {
        this.ws.on('message', async (rawData) => {
            try {
                const packet = JSON.parse(rawData.toString())

                if (packet.type === 'event') {
                    let ackCallback = () => {}
                    if (packet.ackId) {
                        ackCallback = (responseData) => {
                            this._sendRaw({ type: 'ack', ackId: packet.ackId, data: responseData })
                        }
                    }
                    await this.emit(packet.name, ...packet.args, ackCallback)
                }
            } catch (err) {
                console.error('Помилка парсингу WebSocket повідомлення:', err)
            }
        })

        this.ws.on('close', (code, reason) => {
            this.namespace._handleDisconnect(this, reason ? reason.toString() : 'closed')
        })

        this.ws.on('error', (err) => {
            this.emit('error', err)
        })
    }

    join(roomId) {
        if (!roomId) return this
        this.rooms.add(roomId)
        this.namespace.adapter.addAll(this.id, [roomId])
        return this
    }

    leave(roomId) {
        this.rooms.delete(roomId)
        this.namespace.adapter.del(this.id, roomId)
        return this
    }

    to(roomId) {
        return new BroadcastOperator(this.namespace.adapter).to(roomId)
    }

    in(roomId) {
        return this.to(roomId)
    }

    get broadcast() {
        return new BroadcastOperator(this.namespace.adapter).exceptSocket(this.id)
    }

    emit(eventName, ...args) {
        // Якщо для цієї події немає локального EventEmitter слухача на сервері,
        // це означає, що ми робимо звичайний персональний emit клієнту в мережу
        if (!this._listeners.has(eventName)) {
            const packet = { type: 'event', name: eventName, args }
            this._sendRaw(packet)
            return true
        }
        return super.emit(eventName, ...args)
    }

    disconnect(closeConnection = true) {
        if (closeConnection) this.ws.close()
        else this.namespace._handleDisconnect(this, 'server disconnect')
    }

    _sendRaw(packet) {
        if (this.ws.readyState === 1) {
            this.ws.send(JSON.stringify(packet))
        }
    }
}
