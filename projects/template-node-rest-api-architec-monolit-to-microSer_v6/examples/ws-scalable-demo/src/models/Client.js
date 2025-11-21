// src/models/Client.js
export default class Client {
    constructor(id, wsConnection) {
        this.id = id
        this.ws = wsConnection
        this.rooms = new Set()
    }

    send(message) {
        if (this.ws.readyState === this.ws.OPEN) {
            this.ws.send(JSON.stringify(message))
        }
    }
}
