import { SocketWrapper } from './SocketWrapper.js'
import { InProcessAdapter } from './adapters/InProcessAdapter.js'
import { BroadcastOperator } from './BroadcastOperator.js'

export class Namespace {
    constructor(name, AdapterClass = InProcessAdapter) {
        this.name = name // Може бути як String, так і RegExp
        this.sockets = new Map()
        this._middlewares = []
        this._connectionListeners = []
        this.adapter = new AdapterClass(this)
        this.AdapterClass = AdapterClass
    }

    use(fn) {
        this._middlewares.push(fn)
        return this
    }

    on(eventName, callback) {
        if (eventName === 'connection') {
            this._connectionListeners.push(callback)
        }
        return this
    }

    async _handleConnection(ws, handshakeData) {
        const socket = new SocketWrapper(ws, this, handshakeData)

        try {
            for (const middleware of this._middlewares) {
                await new Promise((resolve, reject) => {
                    middleware(socket, (err) => {
                        if (err) reject(err)
                        else resolve()
                    })
                })
            }
        } catch (authError) {
            socket._sendRaw({ type: 'connect_error', message: authError.message })
            ws.close()
            return
        }

        this.sockets.set(socket.id, socket)

        for (const listener of this._connectionListeners) {
            await listener(socket)
        }
    }

    to(roomId) {
        return new BroadcastOperator(this.adapter).to(roomId)
    }

    in(roomId) {
        return this.to(roomId)
    }

    async fetchSockets() {
        return Array.from(this.sockets.values())
    }

    emit(eventName, ...args) {
        const packet = { type: 'event', name: eventName, args }
        this.adapter.broadcast(packet)
    }

    _handleDisconnect(socket, reason) {
        socket.emit('disconnecting', reason)

        this.adapter.delAll(socket.id)
        this.sockets.delete(socket.id)

        socket.emit('disconnect', reason)
        socket.off()
    }
}
