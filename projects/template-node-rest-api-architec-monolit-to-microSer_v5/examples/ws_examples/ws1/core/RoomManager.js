// core/RoomManager.js
export class RoomManager {
    constructor() {
        this.rooms = new Map() // Map<roomName, Set<Socket>>
    }

    addSocketToRoom(roomName, socket) {
        if (!this.rooms.has(roomName)) {
            this.rooms.set(roomName, new Set())
        }
        this.rooms.get(roomName).add(socket)
    }

    removeSocketFromRoom(roomName, socket) {
        if (this.rooms.has(roomName)) {
            this.rooms.get(roomName).delete(socket)
            if (this.rooms.get(roomName).size === 0) {
                this.rooms.delete(roomName) // Видалити кімнату, якщо вона порожня
            }
        }
    }

    getSocketsInRoom(roomName) {
        return this.rooms.get(roomName) || new Set()
    }
}
