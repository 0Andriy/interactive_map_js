import { EventBus } from './EventBus.js'
import { Socket } from './Socket.js'
import { MemoryAdapter } from '../adapters/MemoryAdapter.js'
import { BroadcastOperator } from './BroadcastOperator.js'

/**
 * Ізольований простір імен. Керує кімнатами, адаптером та життєвим циклом підключень сокетів.
 */
export class Namespace extends EventBus {
    constructor(name, server) {
        super()
        this.name = name
        this.server = server
        this.sockets = new Map()
        this.adapter = new MemoryAdapter(this)
    }

    // Дозволяє легко замінити сховище/адаптер (наприклад, RedisAdapter)
    setAdapter(AdapterClass) {
        this.adapter = new AdapterClass(this)
        return this
    }

    handleConnection(ws, req) {
        const socket = new Socket(ws, this)
        this.sockets.set(socket.id, socket)

        this.emit('connection', socket)

        socket.on('disconnect', () => {
            this.sockets.delete(socket.id)
        })
    }

    // Повертає чистий базовий оператор розсилки
    get broadcast() {
        return new BroadcastOperator(this.adapter)
    }

    to(room) {
        return this.broadcast.to(room)
    }
    except(room) {
        return this.broadcast.except(room)
    }
    get local() {
        return this.broadcast.local
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
