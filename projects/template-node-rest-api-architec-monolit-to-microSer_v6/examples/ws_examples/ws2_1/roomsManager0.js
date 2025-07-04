// roomsManager.js
class RoomsManager {
    constructor() {
        this.rooms = new Map() // Map<string, Set<WebSocket>>
        this.clientRooms = new Map() // Map<WebSocket, Set<string>>
    }

    // Присвоєння ID клієнту при підключенні
    addClient(ws) {
        ws.id = this._generateUniqueId() // Ваша функція для генерації ID
        this.clientRooms.set(ws, new Set())
        console.log(`Client ${ws.id} connected.`)
    }

    joinRoom(ws, roomName) {
        if (!this.rooms.has(roomName)) {
            this.rooms.set(roomName, new Set())
        }
        this.rooms.get(roomName).add(ws)
        this.clientRooms.get(ws).add(roomName)
        console.log(
            `Client ${ws.id} joined room ${roomName}. Total clients in ${roomName}: ${
                this.rooms.get(roomName).size
            }`,
        )
    }

    leaveRoom(ws, roomName) {
        if (this.rooms.has(roomName)) {
            this.rooms.get(roomName).delete(ws)
            if (this.rooms.get(roomName).size === 0) {
                this.rooms.delete(roomName)
            }
        }
        if (this.clientRooms.has(ws)) {
            this.clientRooms.get(ws).delete(roomName)
        }
        console.log(`Client ${ws.id} left room ${roomName}.`)
    }

    broadcastToRoom(roomName, message) {
        if (this.rooms.has(roomName)) {
            this.rooms.get(roomName).forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message)
                }
            })
        } else {
            console.warn(`Attempted to broadcast to non-existent room: ${roomName}`)
        }
    }

    // Обробка відключення клієнта
    removeClient(ws) {
        console.log(`Client ${ws.id} disconnected.`)
        if (this.clientRooms.has(ws)) {
            this.clientRooms.get(ws).forEach((roomName) => {
                if (this.rooms.has(roomName)) {
                    this.rooms.get(roomName).delete(ws)
                    if (this.rooms.get(roomName).size === 0) {
                        this.rooms.delete(roomName)
                    }
                }
            })
            this.clientRooms.delete(ws)
        }
    }

    // Допоміжна функція для генерації унікальних ID (можна використовувати uuid)
    _generateUniqueId() {
        return (
            Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15)
        )
    }
}

export default RoomsManager
