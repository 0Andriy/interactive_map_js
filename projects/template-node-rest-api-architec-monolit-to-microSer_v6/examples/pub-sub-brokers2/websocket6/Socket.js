// Socket.js
import crypto from 'crypto'
import { MessageEnvelope } from './MessageEnvelope.js'

export class Socket {
    constructor(rawSocket, namespace, logger) {
        this.id = crypto.randomUUID()
        this.rawSocket = rawSocket
        this.namespace = namespace
        this.logger = logger.child(`Socket:${this.id}`)
        this._events = new Map()

        this._listen()
    }

    _listen() {
        this.rawSocket.on('message', (data) => {
            try {
                const { event, payload } = JSON.parse(data)
                this._trigger(event, payload)
            } catch (e) {
                this.logger.error('Invalid incoming JSON')
            }
        })
    }

    on(event, cb) {
        if (!this._events.has(event)) this._events.set(event, [])
        this._events.get(event).push(cb)
    }

    _trigger(event, payload) {
        this._events.get(event)?.forEach((cb) => cb(payload))
    }

    async join(roomName) {
        await this.namespace.joinRoom(roomName, this)
    }

    rawSend(envelope) {
        if (this.rawSocket.readyState === 1) {
            this.rawSocket.send(JSON.stringify(envelope))
        }
    }
}
