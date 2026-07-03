export class BroadcastOperator {
    constructor(adapter, rooms = new Set(), except = new Set()) {
        this.adapter = adapter
        this.rooms = rooms
        this.except = except
    }

    to(room) {
        this.rooms.add(room)
        return this
    }
    in(room) {
        return this.to(room)
    }
    except(room) {
        this.except.add(room)
        return this
    }

    emit(ev, ...args) {
        const packet = { type: 'event', data: [ev, ...args] }
        this.adapter.broadcast(packet, { rooms: this.rooms, except: this.except })
    }
}
