import { BaseAdapter } from './BaseAdapter.js'

export class MemoryAdapter extends BaseAdapter {
    constructor(namespace) {
        super(namespace)
        this.rooms = new Map() // Кімната -> Set(socketId)
        this.sids = new Map() // socketId -> Set(Кімната)
    }

    addAll(id, rooms) {
        if (!this.sids.has(id)) this.sids.set(id, new Set())

        for (const room of rooms) {
            // Зв'язок: Кімната -> Сокет
            if (!this.rooms.has(room)) this.rooms.set(room, new Set())
            this.rooms.get(room).add(id)

            // Зв'язок: Сокет -> Кімната
            this.sids.get(id).add(room)
        }
    }

    del(id, room) {
        // Видаляємо сокет з кімнати
        if (this.rooms.has(room)) {
            this.rooms.get(room).delete(id)
            if (this.rooms.get(room).size === 0) this.rooms.delete(room)
        }
        // Видаляємо кімнату у сокета
        if (this.sids.has(id)) {
            this.sids.get(id).delete(room)
            if (this.sids.get(id).size === 0) this.sids.delete(id)
        }
    }

    delAll(id) {
        const socketRooms = this.sids.get(id)
        if (!socketRooms) return

        // Швидко чистимо сокет з усіх його кімнат без перебору всього сервера
        for (const room of socketRooms) {
            if (this.rooms.has(room)) {
                this.rooms.get(room).delete(id)
                if (this.rooms.get(room).size === 0) this.rooms.delete(room)
            }
        }
        this.sids.delete(id)
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
