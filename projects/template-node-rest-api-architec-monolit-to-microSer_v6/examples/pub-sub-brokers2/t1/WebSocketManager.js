// WebSocketManager.js
import WebSocket, { WebSocketServer } from 'ws'
import { Client, Namespace } from './models.js'

export class WebSocketManager {
    constructor(port, redisService, logger) {
        this.wss = new WebSocketServer({ port })
        this.logger = logger
        this.redisService = redisService

        this.namespaces = new Map()
        this.allClients = new Map()
    }

    async start() {
        await this.redisService.connect(this.handleExternalMessage.bind(this))

        this.wss.on('connection', this.handleConnection.bind(this))
        this.logger.info(`WS Server listening on port ${this.wss.options.port}`)
    }

    getNamespace(name) {
        if (!this.namespaces.has(name)) {
            this.namespaces.set(name, new Namespace(name))
        }
        return this.namespaces.get(name)
    }

    handleConnection(ws) {
        const clientId = Date.now().toString() + Math.random().toString(36).substr(2, 9)
        const client = new Client(clientId, ws)
        this.allClients.set(clientId, client)

        ws.on('message', (message) => this.handleClientMessage(client, message))
        ws.on('close', () => this.handleDisconnection(clientId))
        ws.on('error', (error) => this.logger.error(`Client ${clientId} error:`, error))

        this.logger.info(`Client ${clientId} connected locally.`)

        // Place the new client into a default room upon connection
        this.joinClientToRoom(client.id, 'chat', 'general')
    }

    handleDisconnection(clientId) {
        this.logger.info(`Client ${clientId} disconnected.`)
        // Note: You would also need logic here to remove clients from specific rooms
        this.allClients.delete(clientId)
    }

    joinClientToRoom(clientId, nsName, roomName) {
        const client = this.allClients.get(clientId)
        if (client) {
            const ns = this.getNamespace(nsName)
            const room = ns.getOrCreateRoom(roomName)
            room.addClient(client)
            this.logger.info(`Client ${clientId} joined ${nsName}:${roomName}`)
            // In a full system, you would publish this JOIN event via Redis too
            // --- CORRECTION: Publish the state change event to the cluster ---
            const stateChangeEvent = JSON.stringify({
                type: 'STATE_CHANGE_JOIN',
                clientId: clientId, // Optional, useful for debugging
                namespace: nsName,
                room: roomName,
            })
            this.redisService.publish(stateChangeEvent)
        }
    }

    handleClientMessage(client, rawMessage) {
        // We structure the message with metadata before publishing to the cluster
        const messageToSend = JSON.stringify({
            namespace: 'chat',
            room: 'general',
            senderId: client.id,
            payload: rawMessage.toString(),
        })

        this.redisService.publish(messageToSend)
    }

    handleExternalMessage(messageString) {
        try {
            const data = JSON.parse(messageString)

            // Check the message type
            if (data.type === 'STATE_CHANGE_JOIN') {
                // This message is NOT a chat message; it's an instruction for this Node
                // to update its local room roster.
                // NOTE: The `clientId` here is only unique to the *originating* node's session.
                // We don't actually need the client object locally if they aren't here.
                // We just need to know *someone* joined the room cluster-wide.
                // In a robust system, you would use Redis to store a global source of truth
                // for "who is in which room", rather than relying solely on local Maps.
                // If you must use local Maps, the state change logic is much more complex
                // and often requires managing global client IDs via Redis as a centralized
                // database, moving away from just Pub/Sub for state management.
            } else {
                // Assume it's a standard broadcast message
                const { namespace, room } = data
                const ns = this.namespaces.get(namespace)
                if (ns) {
                    const targetRoom = ns.rooms.get(room)
                    if (targetRoom) {
                        // Broadcast only to clients local to this server instance
                        targetRoom.broadcast(messageString)
                    }
                }
            }
        } catch (error) {
            this.logger.error('Error processing external message:', error)
        }
    }
}
