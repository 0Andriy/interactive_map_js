import { BaseAdapter } from './BaseAdapter.js'

/**
 * Локальний In-Memory менеджер кімнат та розсилок за умовчанням.
 */
export class MemoryAdapter extends BaseAdapter {
    addAll(id, rooms) {
        for (const room of rooms) {
            if (!this.rooms.has(room)) this.rooms.set(room, new Set())
            this.rooms.get(room).add(id)
        }
    }

    del(id, room) {
        if (this.rooms.has(room)) {
            this.rooms.get(room).delete(id)
            if (this.rooms.get(room).size === 0) this.rooms.delete(room)
        }
    }

    delAll(id) {
        for (const [room, clients] of this.rooms.entries()) {
            clients.delete(id)
            if (clients.size === 0) this.rooms.delete(room)
        }
    }

    broadcast(packet, opts = {}) {
        const { except = [], rooms = [] } = opts
        const targets = new Set()

        if (rooms.length > 0) {
            for (const room of rooms) {
                const clients = this.rooms.get(room)
                if (clients) clients.forEach((id) => targets.add(id))
            }
        } else {
            this.ns.sockets.forEach((_, id) => targets.add(id))
        }

        except.forEach((id) => targets.delete(id))

        for (const id of targets) {
            const socket = this.ns.sockets.get(id)
            if (socket) socket.sendRaw(packet)
        }
    }

    async fetchSockets(opts = {}) {
        const { rooms = [], except = [] } = opts
        const targets = new Set()

        if (rooms.length > 0) {
            for (const room of rooms) {
                const clients = this.rooms.get(room)
                if (clients) clients.forEach((id) => targets.add(id))
            }
        } else {
            this.ns.sockets.forEach((_, id) => targets.add(id))
        }

        except.forEach((id) => targets.delete(id))
        return Array.from(targets)
    }
}
