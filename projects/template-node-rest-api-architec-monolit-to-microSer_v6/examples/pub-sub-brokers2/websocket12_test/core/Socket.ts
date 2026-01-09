import { EventEmitter } from 'events'
import { Packet } from './Types'

export class Socket extends EventEmitter {
    public readonly rooms: Set<string> = new Set()

    constructor(
        public readonly id: string,
        private readonly ws: any,
        public readonly nsp: any,
        private readonly nodeId: string,
    ) {
        super()

        this.ws.on('message', (data: any) => this.onMessage(data))
        this.ws.on('close', () => this.onDisconnect())
        this.ws.on('error', () => this.onDisconnect())
    }

    private onMessage(data: any) {
        try {
            const { event, args } = JSON.parse(data.toString())
            this.emit(event, ...args)
        } catch (e) {
            console.error('Invalid packet format')
        }
    }

    public rawEmit(packet: Packet) {
        // WebSocket.OPEN - 1
        if (this.ws.readyState === 1) {
            this.ws.send(JSON.stringify(packet))
        }
    }

    public emit(event: string, ...args: any[]): boolean {
        this.rawEmit({
            event,
            args,
            metadata: { from: 'server', nsp: this.nsp.name, timestamp: Date.now() },
        })
        return true
    }

    public join(room: string | string[]) {
        const roomsToJoin = Array.isArray(room) ? room : [room]
        const newRooms = roomsToJoin.filter((r) => !this.rooms.has(r))
        if (newRooms.length === 0) return
        newRooms.forEach((r) => this.rooms.add(r))
        this.nsp.adapter.addAll(this.id, new Set(newRooms))
    }

    public isInRoom(room: string): boolean {
        return this.rooms.has(room)
    }

    public leave(room: string) {
        this.rooms.delete(room)
        this.nsp.adapter.delAll(this.id, [room])
    }

    leaveAll() {
        this.nsp.adapter.delAll(this.id, Array.from(this.rooms))
        this.rooms.clear()
    }

    public to(room: string) {
        const hasAccess = this.isInRoom(room)

        return {
            emit: (event: string, ...args: any[]) => {
                if (!hasAccess) return

                this.nsp.adapter.broadcast(
                    {
                        event,
                        args,
                        metadata: {
                            from: this.id,
                            nsp: this.nsp.name,
                            room,
                            timestamp: Date.now(),
                        },
                    },
                    { rooms: new Set([room]), except: new Set([this.id]) },
                )
            },
        }
    }

    get broadcast() {
        return {
            emit: (event: string, ...args: any[]) => {
                this.nsp.adapter.broadcast(
                    { event, args },
                    { except: new Set([this.id]), rooms: this.rooms },
                )
            },
            to: (room: string) => {
                return {
                    emit: (event: string, ...args: any[]) => {
                        this.nsp.adapter.broadcast(
                            { event, args },
                            { except: new Set([this.id]), rooms: new Set([room]) },
                        )
                    },
                }
            },
        }
    }

    private onDisconnect() {
        this.leaveAll()
        this.nsp._removeSocket(this.id)
        this.emit('disconnect')
        this.removeAllListeners()
    }

    public disconnect(closeRaw = true) {
        this.onDisconnect()
        if (closeRaw) this.ws.close()
    }
}
