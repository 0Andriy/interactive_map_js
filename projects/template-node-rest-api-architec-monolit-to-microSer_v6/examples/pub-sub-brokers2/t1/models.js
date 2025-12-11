// models.js

import WebSocket from 'ws'

export class Client {
    constructor(id, ws) {
        this.id = id
        this.ws = ws
    }

    send(message) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(message)
        }
    }
}

export class Room {
    constructor(name) {
        this.name = name
        this.clients = new Map() // Key: Client ID, Value: Client Instance
    }

    addClient(client) {
        this.clients.set(client.id, client)
    }

    removeClient(clientId) {
        this.clients.delete(clientId)
    }

    broadcast(message) {
        this.clients.forEach((client) => client.send(message))
    }
}

export class Namespace {
    constructor(name) {
        this.name = name
        this.rooms = new Map() // Key: Room Name, Value: Room Instance
    }

    getOrCreateRoom(roomName) {
        if (!this.rooms.has(roomName)) {
            this.rooms.set(roomName, new Room(roomName))
        }
        return this.rooms.get(roomName)
    }
}
