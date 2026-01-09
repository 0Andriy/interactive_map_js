import { Packet, BroadcastOptions } from './Types'

export abstract class Adapter {
    public rooms: Map<string, Set<string>> = new Map()

    constructor(protected nsp: any, protected nodeId: string) {}

    public addAll(id: string, rooms: string[]): void {
        for (const room of rooms) {
            if (!this.rooms.has(room)) this.rooms.set(room, new Set())
            this.rooms.get(room)!.add(id)
        }
    }

    public delAll(id: string, rooms: string[]): void {
        for (const room of rooms) {
            const ids = this.rooms.get(room)
            if (ids) {
                ids.delete(id)
                if (ids.size === 0) this.rooms.delete(room)
            }
        }
    }

    public fetchSockets(room?: string): Set<string> {
        if (room) return this.rooms.get(room) || new Set()
        return new Set(this.nsp.sockets.keys())
    }

    public abstract broadcast(packet: Packet, opts: BroadcastOptions): void
    public abstract getRoomSize(room: string): Promise<number>
}
