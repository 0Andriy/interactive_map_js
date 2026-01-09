export class Room {
    constructor(name, adapter) {
        this.name = name
        this.adapter = adapter
    }

    emit(event, payload) {
        this.adapter.broadcast({ event, payload }, { rooms: [this.name] })
    }

    get size() {
        return this.adapter.rooms.get(this.name)?.size || 0
    }
}
