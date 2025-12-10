// src/services/websocket/WebSocketConnection.js
class WebSocketConnection {
    /**
     * @param {object} ws WebSocket instance.
     * @param {string} id Unique connection ID.
     */
    constructor(ws, id) {
        this.ws = ws
        this.id = id
        /** @type {Set<string>} Назви кімнат, до яких належить клієнт (e.g., 'general', 'room1') */
        this.rooms = new Set()
        /** @type {boolean} Статус активності для heartbeat */
        this.isAlive = true
        /** @type {string | null} ID автентифікованого користувача (якщо є) */
        this.userId = null // Додаткове поле для автентифікації
    }

    send(data) {
        if (this.ws.readyState === this.ws.OPEN) {
            this.ws.send(JSON.stringify(data))
        }
    }

    joinRoom(roomName) {
        this.rooms.add(roomName)
    }

    leaveRoom(roomName) {
        this.rooms.delete(roomName)
    }

    isInRoom(roomName) {
        return this.rooms.has(roomName)
    }

    markAlive() {
        this.isAlive = true
    }
}

export default WebSocketConnection
