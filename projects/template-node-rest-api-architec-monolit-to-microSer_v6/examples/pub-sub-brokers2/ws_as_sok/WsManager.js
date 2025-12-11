// src/services/WsManager.js
import { WebSocketServer, WebSocket } from 'ws'
import { Client } from '../models/Client.js'
import { Namespace } from '../models/Namespace.js'
import { v4 as uuidv4 } from 'uuid'

export class WsManager {
    constructor(brokerInstance) {
        this.broker = brokerInstance
        this.wss = null
        this.localClients = new Map() // Всі клієнти, глобально

        // Створюємо простір імен за замовчуванням '/'
        this.defaultNamespace = new Namespace('/', this.broker, this)
        this.namespaces = new Map().set('/', this.defaultNamespace)

        this.serverId = uuidv4()
    }

    async initialize(server) {
        await this.broker.connect()
        this.wss = new WebSocketServer({ server })
        this.wss.on('connection', (ws) => this.handleConnection(ws))

        // Централізований обробник віддалених повідомлень від брокера
        this.broker.subscribe('ws-broadcast', (messageStr) => {
            const message = JSON.parse(messageStr)
            // Знаходимо потрібний об'єкт кімнати і викликаємо локальну відправку
            // Тут ми припускаємо, що всі кімнати в дефолтному namespace
            this.defaultNamespace.to(message.roomId).sendLocal(message)
        })
    }

    handleConnection(ws) {
        const clientId = uuidv4()
        const client = new Client(clientId, ws, '/')
        this.localClients.set(clientId, client)
        this.defaultNamespace.addClient(client)

        ws.on('close', () => this.handleDisconnect(clientId))
        ws.on('message', (msg) => this.handleMessage(clientId, JSON.parse(msg)))
    }

    handleDisconnect(clientId) {
        this.localClients.delete(clientId)
        this.defaultNamespace.removeClient(clientId)
    }

    // Допоміжний метод для доступу з класу Room
    getClient(clientId) {
        return this.localClients.get(clientId)
    }

    // Приклад обробки повідомлення від клієнта
    async handleMessage(clientId, message) {
        if (message.type === 'JOIN_ROOM') {
            const client = this.getClient(clientId)
            client.rooms.add(message.roomId)
            await this.broker.sAdd(`room:${message.roomId}:members`, clientId)
        } else if (message.type === 'SEND_TO_ROOM') {
            // Тепер ми використовуємо API, схоже на Socket.IO:
            await this.defaultNamespace.to(message.roomId).emit('chatMessage', message.payload)
        }
    }
}
