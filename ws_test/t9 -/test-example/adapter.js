import { EventEmitter } from 'events'

export class Adapter extends EventEmitter {
    constructor(nsp) {
        super()
        this.nsp = nsp
        this.rooms = new Map()
        this.sids = new Map()
    }

    addAll(id, rooms) {
        if (!this.sids.has(id)) this.sids.set(id, new Set())
        for (const room of rooms) {
            this.sids.get(id).add(room)
            if (!this.rooms.has(room)) this.rooms.set(room, new Set())
            this.rooms.get(room).add(id)
        }
    }

    del(id, room) {
        if (this.rooms.has(room)) this.rooms.get(room).delete(id)
        if (this.sids.has(id)) this.sids.get(id).delete(room)
    }

    delAll(id) {
        if (!this.sids.has(id)) return
        for (const room of this.sids.get(id)) {
            this.rooms.get(room).delete(id)
            if (this.rooms.get(room).size === 0) this.rooms.delete(room)
        }
        this.sids.delete(id)
    }

    broadcast(packet, opts = {}) {
        const rooms = opts.rooms || new Set()
        const except = opts.except || new Set()
        const targets = new Set()

        if (rooms.size > 0) {
            for (const room of rooms) {
                const ids = this.rooms.get(room)
                if (ids) {
                    for (const id of ids) if (!except.has(id)) targets.add(id)
                }
            }
        } else {
            for (const id of this.sids.keys()) {
                if (!except.has(id)) targets.add(id)
            }
        }

        for (const id of targets) {
            const socket = this.nsp.sockets.get(id)
            if (socket) socket.packet(packet)
        }
    }
}
