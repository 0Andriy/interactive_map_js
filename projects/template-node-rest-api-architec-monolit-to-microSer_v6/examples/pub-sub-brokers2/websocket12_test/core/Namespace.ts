import { EventEmitter } from 'events'
import { Socket } from './Socket'
import crypto from 'crypto'

export class Namespace extends EventEmitter {
    public sockets: Map<string, Socket> = new Map()
    public adapter: any
    private middlewares: Array<(socket: Socket, next: (err?: Error) => void) => void> = []

    constructor(public readonly name: string, AdapterClass: any, private readonly nodeId: string) {
        super()

        this.nodeId = nodeId
        this.adapter = new AdapterClass(this, nodeId)
    }

    public use(fn: (socket: Socket, next: (err?: Error) => void) => void) {
        this.middlewares.push(fn)
        return this
    }

    public async _onConnection(ws: any, req?: any) {
        const id = crypto.randomUUID() //Math.random().toString(36).substring(2, 15)
        const socket = new Socket(id, ws, this, this.nodeId)

        try {
            for (const middleware of this.middlewares) {
                await new Promise<void>((resolve, reject) => {
                    middleware(socket, (err) => (err ? reject(err) : resolve()))
                })
            }

            this.sockets.set(id, socket)

            super.emit('connection', socket)
        } catch (err: any) {
            socket.rawEmit({
                event: 'connect_error',
                args: [err.message || 'Authentication error'],
                metadata: { from: 'server', nsp: this.name, timestamp: Date.now() },
            })
            socket.disconnect()
        }
    }

    _onDisconnect(socket: Socket) {
        this.adapter.delAll(socket.id, Array.from(socket.rooms))
        this.sockets.delete(socket.id)
    }

    public _removeSocket(id: string) {
        this.sockets.delete(id)
    }

    // emit
    public broadcast(event: string, ...args: any[]): boolean {
        this.adapter.broadcast(
            {
                event,
                args,
                metadata: { from: 'server', nsp: this.name, timestamp: Date.now() },
            },
            {}, // Глобально в межах NS
        )
        return true
    }

    public to(room: string | string[]) {
        const rooms = new Set(Array.isArray(room) ? room : [room])

        return {
            // Дозволяємо ланцюжки .to('room1').to('room2')
            to: (nextRoom: string) => {
                rooms.add(nextRoom)
                return this.to(Array.from(rooms))
            },
            emit: (event: string, ...args: any[]) => {
                this.adapter.broadcast(
                    {
                        event,
                        args,
                        metadata: {
                            from: 'server',
                            nsp: this.name,
                            room: Array.from(rooms).join(','),
                            timestamp: Date.now(),
                        },
                    },
                    { rooms },
                )
            },
        }
    }

    public get localSize(): number {
        return this.sockets.size
    }

    public async getLocalSockets(room?: string): Promise<Set<string>> {
        return await this.adapter.fetchSockets(room)
    }

    public async isRoomEmpty(room: string): Promise<boolean> {
        const sockets = await this.getLocalSockets(room)
        return sockets.size === 0
    }

    public async fetchGlobalSize(room: string): Promise<number> {
        return await this.adapter.getRoomSize(room)
    }

    close() {
        this.sockets.forEach((s) => s.disconnect())
        this.sockets.clear()
        if (this.adapter && typeof this.adapter.close === 'function') {
            this.adapter.close()
        }
        this.removeAllListeners()
    }
}
