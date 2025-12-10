// src/services/websocket/WebSocketNamespace.js
import WebSocketRoom from './WebSocketRoom.js'

class WebSocketNamespace {
    constructor(name, eventBroker, logger) {
        this.name = name
        this.eventBroker = eventBroker
        this.logger = logger
        /** @type {Map<string, WebSocketRoom>} */
        this.rooms = new Map()
    }

    joinRoom(connection, roomName) {
        if (!this.rooms.has(roomName)) {
            this.rooms.set(roomName, new WebSocketRoom(roomName))
        }
        const room = this.rooms.get(roomName)
        room.addConnection(connection)
        connection.joinRoom(roomName)
        this.logger.info(
            `[WS NS ${this.name}]: Connection ${connection.id} joined room ${roomName}.`,
        )
    }

    leaveRoom(connection, roomName) {
        const room = this.rooms.get(roomName)
        if (room) {
            room.removeConnection(connection)
            connection.leaveRoom(roomName)
            if (room.size === 0) {
                this.rooms.delete(roomName)
            }
            this.logger.info(
                `[WS NS ${this.name}]: Connection ${connection.id} left room ${roomName}.`,
            )
        }
    }

    /**
     * Розсилає повідомлення всім у певній кімнаті (використовуючи метод класу Room).
     */
    emitToRoom(roomName, eventName, data) {
        const room = this.rooms.get(roomName)
        if (room) {
            const message = { namespace: this.name, room: roomName, event: eventName, data: data }
            room.broadcast(message)
            this.logger.info(
                `[WS NS ${this.name}]: Emitted '${eventName}' to room '${roomName}' (${room.size} clients).`,
            )
        }
    }
}

export default WebSocketNamespace
