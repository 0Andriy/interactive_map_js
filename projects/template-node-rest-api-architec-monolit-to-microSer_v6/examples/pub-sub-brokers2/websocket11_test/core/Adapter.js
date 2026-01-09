export class Adapter {
    constructor(nsp) {
        this.nsp = nsp
        this.rooms = new Map() // RoomName -> Set(SocketID)
        this.sids = new Map() // SocketID -> Set(RoomName)
    }

    addAll(id, rooms) {
        for (const room of rooms) {
            if (!this.rooms.has(room)) this.rooms.set(room, new Set())
            this.rooms.get(room).add(id)

            if (!this.sids.has(id)) this.sids.set(id, new Set())
            this.sids.get(id).add(room)
        }
    }

    del(id, room) {
        if (this.rooms.has(room)) {
            this.rooms.get(room).delete(id)
            if (this.rooms.get(room).size === 0) this.rooms.delete(room)
        }
        if (this.sids.has(id)) {
            this.sids.get(id).delete(room)
        }
    }

    delAll(id) {
        const rooms = this.sids.get(id)
        if (rooms) {
            for (const room of rooms) this.del(id, room)
        }
        this.sids.delete(id)
    }

    broadcast(packet, opts = {}) {
        this._localBroadcast(packet, opts)
    }

    _localBroadcast(packet, opts = {}) {
        const { except = [], rooms = [] } = opts
        const targetIds = new Set()

        if (rooms.length > 0) {
            for (const room of rooms) {
                const ids = this.rooms.get(room)
                if (ids) ids.forEach((id) => targetIds.add(id))
            }
        } else {
            // Якщо кімнат немає — розсилка всім у неймспейсі
            this.nsp.sockets.forEach((_, id) => targetIds.add(id))
        }

        for (const id of targetIds) {
            if (except.includes(id)) continue
            const socket = this.nsp.sockets.get(id)
            if (socket) socket._sendRaw(packet)
        }
    }

    async fetchSockets() {
        return Array.from(this.nsp.sockets.values()).map((s) => ({
            id: s.id,
            rooms: Array.from(s.rooms),
        }))
    }
}
