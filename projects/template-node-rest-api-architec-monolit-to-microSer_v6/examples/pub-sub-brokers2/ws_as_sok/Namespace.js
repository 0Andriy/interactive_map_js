// src/models/Namespace.js
import { Room } from './Room.js'

export class Namespace {
    constructor(name, broker, wsManager) {
        this.name = name
        this.broker = broker
        this.wsManager = wsManager
        this.rooms = new Map() // roomId -> Room instance
        this.localClients = new Map() // userId -> Client instance, тільки в цьому namespace
    }

    // Аналог io.of('/admin').to('roomName')
    to(roomId) {
        if (!this.rooms.has(roomId)) {
            // Створюємо екземпляр кімнати, передаючи залежності
            this.rooms.set(roomId, new Room(roomId, this.broker, this.wsManager))
        }
        return this.rooms.get(roomId)
    }

    addClient(client) {
        this.localClients.set(client.id, client)
    }

    removeClient(clientId) {
        this.localClients.delete(clientId)
        // Також потрібно очистити всі кімнати в брокере для цього клієнта
    }
}
