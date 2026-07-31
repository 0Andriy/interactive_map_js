import { BaseAdapter } from './BaseAdapter.js'

export class InProcessAdapter extends BaseAdapter {
    constructor(namespace) {
        super(namespace)
    }

    addAll(socketId, rooms) {
        if (!this.sids.has(socketId)) {
            this.sids.set(socketId, new Set())
        }
        for (const room of rooms) {
            this.sids.get(socketId).add(room)
            if (!this.rooms.has(room)) {
                this.rooms.set(room, new Set())
            }
            this.rooms.get(room).add(socketId)
        }
    }

    del(socketId, room) {
        if (this.sids.has(socketId)) {
            this.sids.get(socketId).delete(room)
        }
        if (this.rooms.has(room)) {
            this.rooms.get(room).delete(socketId)
            if (this.rooms.get(room).size === 0) this.rooms.delete(room)
        }
    }

    delAll(socketId) {
        if (!this.sids.has(socketId)) return
        for (const room of this.sids.get(socketId)) {
            this.del(socketId, room)
        }
        this.sids.delete(socketId)
    }

    broadcast(packet, opts = {}) {
        const rooms = opts.rooms || new Set()
        const except = opts.except || new Set()
        const targetSocketIds = new Set()

        if (rooms.size > 0) {
            for (const room of rooms) {
                const roomSids = this.rooms.get(room)
                if (roomSids) {
                    roomSids.forEach((id) => targetSocketIds.add(id))
                }
            }
        } else {
            this.namespace.sockets.forEach((s) => targetSocketIds.add(s.id))
        }

        except.forEach((id) => targetSocketIds.delete(id))

        targetSocketIds.forEach((socketId) => {
            const socket = this.namespace.sockets.get(socketId)
            if (socket) {
                socket._sendRaw(packet)
            }
        })
    }
}
