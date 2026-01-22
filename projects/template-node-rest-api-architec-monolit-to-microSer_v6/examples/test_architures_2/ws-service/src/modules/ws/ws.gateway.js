// src/modules/ws/ws.gateway.js
export class WSGateway {
    constructor(io, wsService) {
        this.io = io
        this.wsService = wsService
        this.handleConnections()
    }

    handleConnections() {
        this.io.on('connection', (socket) => {
            const userId = socket.user.sub
            console.log(`User connected: ${userId}`)

            // Приєднуємо користувача до персональної кімнати
            socket.join(`user:${userId}`)

            socket.on('disconnect', () => {
                console.log(`User disconnected: ${userId}`)
            })
        })
    }
}
