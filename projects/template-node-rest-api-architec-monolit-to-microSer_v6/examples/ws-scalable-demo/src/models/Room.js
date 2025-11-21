// src/models/Room.js
export default class Room {
    constructor(id) {
        this.id = id
        this.clients = new Set()
    }

    addClient(client) {
        this.clients.add(client)
        client.rooms.add(this.id)
    }

    removeClient(client) {
        this.clients.delete(client)
        client.rooms.delete(this.id)
    }
}
