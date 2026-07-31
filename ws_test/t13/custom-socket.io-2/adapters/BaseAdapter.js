export class BaseAdapter {
    constructor(namespace) {
        this.namespace = namespace
        this.rooms = new Map() // roomId -> Set of socketIds
        this.sids = new Map() // socketId -> Set of roomIds
    }

    addAll(socketId, rooms) {
        throw new Error('Method not implemented')
    }
    del(socketId, room) {
        throw new Error('Method not implemented')
    }
    delAll(socketId) {
        throw new Error('Method not implemented')
    }
    broadcast(packet, opts) {
        throw new Error('Method not implemented')
    }
}
