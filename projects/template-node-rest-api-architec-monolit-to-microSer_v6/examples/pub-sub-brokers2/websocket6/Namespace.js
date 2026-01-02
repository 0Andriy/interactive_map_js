// Namespace.js
import { MessageEnvelope } from './MessageEnvelope.js'

export class Namespace {
    constructor(name, deps) {
        this.name = name
        this.state = deps.state
        this.broker = deps.broker
        this.serverId = deps.serverId
        this.logger = deps.logger.child(`NS:${name}`)

        this.localSockets = new Map()
        this.rooms = new Map() // room -> Set<socketId>
        this._eventHandlers = new Map()

        this._setupBroker()
    }

    _setupBroker() {
        const pattern = `broker:${this.name}:*`
        this.broker.subscribe(pattern, (packet) => {
            if (packet.originId !== this.serverId) {
                this._dispatchLocal(packet.room, packet.envelope)
            }
        })
    }

    on(event, cb) {
        if (!this._eventHandlers.has(event)) this._eventHandlers.set(event, [])
        this._eventHandlers.get(event).push(cb)
    }

    _emitInternal(event, data) {
        this._eventHandlers.get(event)?.forEach((cb) => cb(data))
    }

    async joinRoom(roomName, socket) {
        if (!this.rooms.has(roomName)) this.rooms.set(roomName, new Set())

        const roomSet = this.rooms.get(roomName)
        if (!roomSet.has(socket.id)) {
            roomSet.add(socket.id)
            await this.state.addUserToRoom(this.name, roomName, socket.id)
            this.logger.info(`Socket ${socket.id} joined ${roomName}`)
        }
    }

    to(roomName) {
        return {
            emit: async (event, payload, senderId = null) => {
                const envelope = MessageEnvelope.create({
                    ns: this.name,
                    room: roomName,
                    event,
                    payload,
                    sender: senderId,
                })

                await this.broker.publish(`broker:${this.name}:${roomName}`, {
                    originId: this.serverId,
                    room: roomName,
                    envelope,
                })

                this._dispatchLocal(roomName, envelope)
            },
        }
    }

    _dispatchLocal(roomName, envelope) {
        const ids = this.rooms.get(roomName)
        ids?.forEach((id) => {
            this.localSockets.get(id)?.rawSend(envelope)
        })
    }

    _removeSocket(socket) {
        this.localSockets.delete(socket.id)
        this.rooms.forEach((set, room) => {
            if (set.has(socket.id)) {
                set.delete(socket.id)
                this.state.removeUserFromRoom(this.name, room, socket.id)
            }
        })
    }
}
