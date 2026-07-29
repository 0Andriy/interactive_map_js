/**
 * Інтерфейсний контракт для побудови будь-яких адаптерів горизонтального масштабування.
 */
export class BaseAdapter {
    constructor(namespace) {
        this.ns = namespace
        this.rooms = new Map()
    }
    addAll(id, rooms) {}
    del(id, room) {}
    delAll(id) {}
    broadcast(packet, opts) {}
    async fetchSockets(opts) {
        return []
    }
}
