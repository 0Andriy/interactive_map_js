// src/models/Client.js
export class Client {
    constructor(id, ws, namespaceId) {
        this.id = id
        this.ws = ws
        this.namespaceId = namespaceId
        this.rooms = new Set()
    }
    send(message) {
        if (this.ws.readyState === this.ws.OPEN) {
            this.ws.send(JSON.stringify(message))
        }
    }
}
