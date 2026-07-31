import { SocketWrapper } from './SocketWrapper.js'
import { InProcessAdapter } from './adapters/InProcessAdapter.js'

export class Namespace {
    constructor(name, AdapterClass = InProcessAdapter) {
        this.name = name
        this.sockets = new Map() // socketId -> SocketWrapper
        this._middlewares = []
        this._connectionListeners = []

        // Впровадження залежності (Composition) Адаптера
        this.adapter = new AdapterClass(this)
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

        // Викликаємо системну подію підключення
        for (const listener of this._connectionListeners) {
            await listener(socket)
        }
    }

    // Метод для розсилки повідомлень з рівня самого io.of('/chat').to('room')
    to(roomId) {
        return {
            emit: (eventName, ...args) => {
                const packet = { type: 'event', name: eventName, args }
                this.adapter.broadcast(packet, { rooms: new Set([roomId]) })
            },
        }
    }

    // Метод імітації fetchSockets для адмінських задач вашого сервера
    async fetchSockets() {
        return Array.from(this.sockets.values())
    }

    // Метод імітації io.of('/chat').in('room').fetchSockets()
    in(roomId) {
        const self = this
        return {
            async fetchSockets() {
                const socketIds = self.adapter.rooms.get(roomId) || new Set()
                const found = []
                for (const id of socketIds) {
                    const s = self.sockets.get(id)
                    if (s) found.push(s)
                }
                return found
            },
        }
    }

    // Метод для глобального еміту в межах всього Namespace
    emit(eventName, ...args) {
        const packet = { type: 'event', name: eventName, args }
        this.adapter.broadcast(packet)
    }

    _handleDisconnect(socket, reason) {
        // Спочатку тригеримо внутрішній EventEmitter сокету для 'disconnecting'
        socket.emit('disconnecting', reason)

        // Очищаємо дані кімнат користувача в Адаптері
        this.adapter.delAll(socket.id)
        this.sockets.delete(socket.id)

        // Тригеримо подію 'disconnect'
        socket.emit('disconnect', reason)
        socket.off() // Очищаємо всі підписки для запобігання витоку пам'яті
    }
}
