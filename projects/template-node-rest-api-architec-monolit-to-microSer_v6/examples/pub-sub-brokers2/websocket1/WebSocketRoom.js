// src/services/websocket/WebSocketRoom.js
class WebSocketRoom {
    constructor(name) {
        this.name = name
        /** @type {Set<import('./WebSocketConnection.js').default>} */
        this.connections = new Set()
    }

    addConnection(connection) {
        this.connections.add(connection)
    }

    removeConnection(connection) {
        this.connections.delete(connection)
    }

    /**
     * Розсилає повідомлення всім учасникам кімнати.
     * @param {object} message Об'єкт повідомлення для відправки.
     */
    broadcast(message) {
        this.connections.forEach((conn) => {
            conn.send(message)
        })
    }

    get size() {
        return this.connections.size
    }
}

export default WebSocketRoom
