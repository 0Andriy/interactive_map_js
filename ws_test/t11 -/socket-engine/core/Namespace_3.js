import { EventBus } from './EventBus.js'
import { Socket } from './Socket.js'
import { BroadcastOperator } from './BroadcastOperator.js'

export class Namespace extends EventBus {
    // Конструктор приймає клас адаптера ззовні (DI)
    constructor(name, server, AdapterClass) {
        super()
        this.name = name
        this.server = server
        this.sockets = new Map()
        this.adapter = new AdapterClass(this)
    }

    handleConnection(ws, handshake) {
        const socket = new Socket(ws, this, handshake)
        this.sockets.set(socket.id, socket)

        // Автоматична ізоляція користувача в його персональну кімнату (Multi-device)
        if (socket.user && socket.user.id) {
            socket.join(`user:${socket.user.id}`)
        }

        for (const { PluginClass, opts } of this.server.plugins) {
            PluginClass.attach(socket, opts)
        }

        this.emit('connection', socket)

        socket.on('disconnect', () => {
            this.sockets.delete(socket.id)
        })
    }

    get broadcast() {
        return new BroadcastOperator(this.adapter)
    }
    to(room) {
        return this.broadcast.to(room)
    }
    except(room) {
        return this.broadcast.except(room)
    }

    emit(event, ...args) {
        if (['connection', 'connect'].includes(event)) {
            super.emit(event, ...args)
            return
        }
        this.broadcast.emit(event, ...args)
    }

    async fetchSockets(opts = {}) {
        const socketIds = await this.adapter.fetchSockets(opts)
        const result = []
        for (const id of socketIds) {
            const socket = this.sockets.get(id)
            if (socket) result.push(socket)
        }
        return result
    }
}
