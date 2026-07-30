import { EventBus } from './EventBus.js'
import { Socket } from './Socket.js'
import { MemoryAdapter } from '../adapters/MemoryAdapter.js'
import { BroadcastOperator } from './BroadcastOperator.js'

export class Namespace extends EventBus {
    constructor(name, server) {
        super()
        this.name = name
        this.server = server
        this.sockets = new Map()
        this.adapter = new MemoryAdapter(this)
    }

    setAdapter(AdapterClass) {
        this.adapter = new AdapterClass(this)
        return this
    }

    handleConnection(ws, handshake) {
        const socket = new Socket(ws, this, handshake)
        this.sockets.set(socket.id, socket)

        // Автоматично вішаємо всі зареєстровані на сервері глобальні плагіни
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
