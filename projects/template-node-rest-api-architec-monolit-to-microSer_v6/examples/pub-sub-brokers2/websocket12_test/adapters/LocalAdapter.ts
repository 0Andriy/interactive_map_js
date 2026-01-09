import { Adapter } from '../core/Adapter'
import { Packet, BroadcastOptions } from '../core/Types'

export class LocalAdapter extends Adapter {
    public broadcast(packet: Packet, opts: BroadcastOptions): void {
        const targetIds = new Set<string>()

        if (opts.rooms && opts.rooms.size > 0) {
            opts.rooms.forEach((room) => {
                this.rooms.get(room)?.forEach((id) => targetIds.add(id))
            })
        } else {
            this.nsp.sockets.forEach((_: any, id: string) => targetIds.add(id))
        }

        // Anti-echo: видаляємо виключених (наприклад, відправника)
        opts.except?.forEach((id) => targetIds.delete(id))

        targetIds.forEach((id) => {
            this.nsp.sockets.get(id)?.rawEmit(packet)
        })
    }

    fetchSockets(room?: string): Set<string> {
        if (room) {
            return this.rooms.get(room) || new Set()
        }
        // Якщо room не вказано — повертаємо всіх у Namespace
        return new Set(this.nsp.sockets.keys())
    }

    public async getRoomSize(room: string): Promise<number> {
        return this.rooms.get(room)?.size || 0
    }
}
