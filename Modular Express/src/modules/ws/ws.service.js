// ws.service.js
import { WebSocketServer } from 'ws'
import eventBus from '../../common/events/event-bus.js'

class WsService {
    constructor(server) {
        this.wss = new WebSocketServer({ server })
        this.clients = new Map() // userId -> socket
        this.init()
    }

    init() {
        this.wss.on('connection', (ws, req) => {
            console.log('[WS] New connection established')

            // Тут можна додати логіку аутентифікації через токен з query
            ws.on('message', (message) => this.handleMessage(ws, message))
            ws.on('close', () => console.log('[WS] Connection closed'))
        })

        // ПІДПИСКА НА ПОДІЇ ШИНИ (Слабкий зв'язок)
        eventBus.on('user:created', (data) => this.broadcast('NEW_USER_REGISTERED', data))
        eventBus.on('auth:login', (data) =>
            this.sendToUser(data.userId, 'SECURITY_ALERT', { message: 'New login detected' }),
        )
    }

    broadcast(type, payload) {
        const message = JSON.stringify({ type, payload })
        this.wss.clients.forEach((client) => {
            if (client.readyState === 1) client.send(message)
        })
    }

    sendToUser(userId, type, payload) {
        const client = this.clients.get(userId)
        if (client && client.readyState === 1) {
            client.send(JSON.stringify({ type, payload }))
        }
    }
}

export default WsService
