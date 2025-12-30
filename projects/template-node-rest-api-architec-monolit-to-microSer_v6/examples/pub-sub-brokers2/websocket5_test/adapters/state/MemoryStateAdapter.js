import { IStateAdapter } from '../../interfaces/IStateAdapter.js'

/**
 * @implements {IStateAdapter}
 */
export class MemoryStateAdapter extends IStateAdapter {
    constructor() {
        super()
        this.rooms = new Map() // "ns:room" -> Set
        this.socketToRooms = new Map() // "ns:id" -> Set
    }

    async addUserToRoom(ns, room, socketId) {
        const rK = `${ns}:${room}`
        const sK = `${ns}:${socketId}`

        if (!this.rooms.has(rK)) {
            this.rooms.set(rK, new Set())
        }
        this.rooms.get(rK).add(socketId)

        if (!this.socketToRooms.has(sK)) {
            this.socketToRooms.set(sK, new Set())
        }
        this.socketToRooms.get(sK).add(room)
    }

    async isMember(ns, room, socketId) {
        const rK = `${ns}:${room}`
        return this.rooms.has(rK) && this.rooms.get(rK).has(socketId)
    }

    async removeUserFromRoom(ns, room, socketId) {
        const rK = `${ns}:${room}`
        const sK = `${ns}:${socketId}`

        // Видаляємо сокет з кімнати
        const roomSet = this.rooms.get(rK)
        if (roomSet) {
            roomSet.delete(socketId)

            // АВТО-ОЧИЩЕННЯ: якщо порожня — видаляємо з пам'яті
            if (roomSet.size === 0) {
                this.rooms.delete(rK)
            }
        }

        // Видаляємо кімнату зі списку сокета
        const socketSet = this.socketToRooms.get(sK)
        if (socketSet) {
            socketSet.delete(room)
            if (socketSet.size === 0) {
                this.socketToRooms.delete(sK)
            }
        }
    }

    async getClientsInRoom(ns, room) {
        return Array.from(this.rooms.get(`${ns}:${room}`) || [])
    }

    async getUserRooms(ns, socketId) {
        return Array.from(this.socketToRooms.get(`${ns}:${socketId}`) || [])
    }

    // async getClientsInNamespace(ns) {
    //     const all = new Set()
    //     for (const [k, set] of this.rooms.entries()) {
    //         if (k.startsWith(`${ns}:`)) set.forEach((id) => all.add(id))
    //     }
    //     return Array.from(all)
    // }

    async getAllConnections(ns = null) {
        const keys = Array.from(this.socketToRooms.keys())
        return ns
            ? keys.filter((k) => k.startsWith(`${ns}:`)).map((k) => k.split(':')[1])
            : keys.map((k) => k.split(':')[1])
    }

    async clearServerData() {
        this.rooms.clear()
        this.socketToRooms.clear()
    }
}
