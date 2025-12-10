// src/services/websocket/WebSocketConnection.js
class WebSocketConnection {
    constructor(ws, id) {
        this.ws = ws
        this.id = id
        this.userId = null
        this.isAlive = true
        // При великих навантаженнях кімнати краще зберігати в Redis, а не тут
    }

    send(data) {
        if (this.ws.readyState === this.ws.OPEN) {
            // Максимально ефективна відправка даних
            this.ws.send(JSON.stringify(data))
        }
    }

    markAlive() {
        this.isAlive = true
    }
}
export default WebSocketConnection
