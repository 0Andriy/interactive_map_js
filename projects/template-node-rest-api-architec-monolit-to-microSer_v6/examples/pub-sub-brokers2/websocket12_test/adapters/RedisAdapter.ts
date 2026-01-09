// src/adapters/RedisAdapter.ts
export class RedisAdapter extends Adapter {
    private pub: any
    private sub: any
    private roomSubCounts: Map<string, number> = new Map()

    // Формат каналу: "nsp:/chat:room:123"
    private getChannel(room?: string) {
        return `nsp:${this.nsp.name}${room ? `:room:${room}` : ':global'}`
    }

    // Ключ у Redis для кімнати: "nsp:/chat:room:lobby:members"
    private getRedisKey(room: string) {
        return `members:${this.nsp.name}:${room}`
    }

    addAll(id: string, rooms: string[]) {
        super.addAll(id, rooms) // Оновлюємо локальну карту
        rooms.forEach(async (room) => {
            const count = (this.roomSubCounts.get(room) || 0) + 1
            this.roomSubCounts.set(room, count)

            if (count === 1) {
                this.sub.subscribe(this.getChannel(room), this.onMessage)
            }

            // Додаємо ID сокета в загальний Set у Redis
            await this.pub.sAdd(this.getRedisKey(room), id)
        })
    }

    delAll(id: string, rooms: string[]) {
        super.delAll(id, rooms)
        rooms.forEach(async (room) => {
            const count = (this.roomSubCounts.get(room) || 0) - 1
            if (count <= 0) {
                this.sub.unsubscribe(this.getChannel(room))
                this.roomSubCounts.delete(room)
            } else {
                this.roomSubCounts.set(room, count)
            }

            await this.pub.sRem(this.getRedisKey(room), id)
        })
    }

    broadcast(packet: any, opts: BroadcastOptions) {
        const message = JSON.stringify({ packet, opts, senderNode: NODE_ID })

        if (opts.rooms && opts.rooms.size > 0) {
            // Публікуємо в канали конкретних кімнат
            opts.rooms.forEach((room) => {
                this.pub.publish(this.getChannel(room), message)
            })
        } else {
            // Глобальна розсилка в межах Namespace
            this.pub.publish(this.getChannel(), message)
        }
    }

    async getRoomSize(room: string): Promise<number> {
        return await this.pub.sCard(this.getRedisKey(room))
    }

    private onMessage = (msg: string, channel: string) => {
        const { packet, opts, senderNode } = JSON.parse(msg)
        if (senderNode === NODE_ID) return // Anti-echo між процесами

        // Локальна розсилка по підключеним до цього вузла сокетам
        this.localBroadcast(packet, opts)
    }

    fetchSockets(room?: string): Set<string> {
        // Повертає тільки сокети, що підключені до ЦЬОГО вузла
        return super.fetchSockets(room)
    }
}
