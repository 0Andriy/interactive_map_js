import crypto from 'crypto'
import { Client } from './Client.js'
import { Room } from './Room.js'

/**
 * @typedef {import('../utils/logger.js').ILogger} ILogger
 * @typedef {import('./Room.js').RoomOptions} RoomOptions
 */

/**
 * Керує WebSocket-з'єднанням в межах одного простору імен
 */
export class RoomsManager {
    /**
     * @readonly
     */
    logger

    /**
     * @private
     * @type {Map<string, Client>}
     */
    #clients = new Map()

    /**
     * @private
     * @type {Map<string, Room>}
     */
    #rooms = new Map()

    /**
     * @private
     * @type {Map<string, Set<string>>}
     */
    #userConnections = new Map()

    /**
     * @param {{logger?: ILogger}} options
     */
    constructor({ logger = console } = {}) {
        this.logger = logger
    }

    onNewConnection(ws, clientOptions = {}) {
        const client = new Client(ws, crypto.randomUUID(), clientOptions)
        this.#clients.set(client.id, client)

        if (client.userId) {
            if (!this.#userConnections.has(client.userId)) {
                this.#userConnections.set(client.userId, new Set())
            }
            this.#userConnections.get(client.userId).add(client.id)
        }

        ws.once('close', () => this.#removeClient(client.id))
        this.logger.info(`Нове з'єднання зареєстровано: ${client.getIdentifier()}.`)
        return client
    }

    createRoom(roomName, roomOptions = {}) {
        if (this.#rooms.has(roomName)) return this.#rooms.get(roomName)

        const room = new Room(roomName, roomOptions, this)
        this.#rooms.set(roomName, room)
        return room
    }

    joinRoom(clientId, roomName) {
        const client = this.#clients.get(clientId)
        const room = this.#rooms.get(roomName)
        if (!client || !room) return false

        room.addClient(client.id)
        client.joinRoom(room.name)

        return true
    }

    joinOrCreateRoom(clientId, roomName, roomOptions = {}) {
        if (!this.#rooms.has(roomName)) this.createRoom(roomName, roomOptions)
        return this.joinRoom(clientId, roomName)
    }

    leaveRoom(clientId, roomName) {
        const client = this.#clients.get(clientId)
        const room = this.#rooms.get(roomName)
        if (client && room) {
            room.removeClient(client.id)
            client.leaveRoom(room.name)
        }
    }

    checkAndRemoveEmptyRoom(roomName) {
        const room = this.#rooms.get(roomName)
        if (room && room.getClientCount() === 0) {
            this.#rooms.delete(roomName)
            this.logger.info(`Порожню кімнату '${roomName}' видалено.`)
        }
    }

    /**
     * @private
     */
    #removeClient(clientId) {
        const client = this.#clients.get(clientId)
        if (!client) return

        this.logger.info(`Видалення клієнта: ${client.getIdentifier()}`)
        client.rooms.forEach((roomName) => this.leaveRoom(client.id, roomName))
        if (client.userId) {
            const userConns = this.#userConnections.get(client.userId)
            if (userConns) {
                userConns.delete(client.id)
                if (userConns.size === 0) this.#userConnections.delete(client.userId)
            }
        }

        this.#clients.delete(clientId)
    }

    sendMessageToRoom(roomName, message, sendOptions = {}) {
        const room = this.#rooms.get(roomName)
        return room ? room.broadcast(message, sendOptions) : 0
    }

    sendMessageToClient(clientId, message, sendOptions = {}) {
        const client = this.#clients.get(clientId)
        return client ? client.send(message, sendOptions) : false
    }

    sendMessageToUser(userId, message, sendOptions = {}) {
        const connectionIds = this.#userConnections.get(userId)
        if (!connectionIds) return 0

        let sentCount = 0
        connectionIds.forEach((id) => {
            if (this.sendMessageToClient(id, message, sendOptions)) sentCount++
        })
        return sentCount
    }

    getClientById(clientId) {
        return this.#clients.get(clientId)
    }

    getRoom(roomName) {
        return this.#rooms.get(roomName)
    }
}
