import { Adapter } from './Adapter.js'
import Redis from 'ioredis'

export class RedisAdapter extends Adapter {
    constructor(nsp) {
        super(nsp)
        const redisOptions = nsp.server.options.redis || {}

        // Два клієнти: один для команд (PUB), другий для прослуховування (SUB)
        this.pub = new Redis(redisOptions)
        this.sub = new Redis(redisOptions)

        this.serverId = nsp.server.serverId

        // Канали
        this.globalChannel = `nexus:${nsp.name}:global`
        this.requestChannel = `nexus:${nsp.name}:cluster_req`

        // Мапа для відстеження активних підписок на кімнати (Granular Subscriptions)
        this.subscribedChannels = new Map()

        this._init()
    }

    async _init() {
        // 1. Основна розсилка повідомлень
        await this.subClient.subscribe(this.globalChannel)

        // 2. Підписка на кластерні запити (fetchAllSockets)
        await this.sub.subscribe(this.requestChannel)

        this.subClient.on('message', (channel, message) => {
            const data = JSON.parse(message)

            // 1. Обробка кластерних запитів (fetchAllSockets)
            if (channel === this.requestChannel) {
                this._handleClusterRequest(data)
                return
            }

            // 2. Обробка відповідей на fetchSockets (тимчасові канали)
            if (channel.startsWith(`nexus:res:`)) {
                // Ці повідомлення обробляються безпосередньо в промісі fetchSockets
                return
            }

            // 3. Обробка розсилок (Broadcast)
            if (data.serverId === this.serverId) return // Ігноруємо свої ж повідомлення

            if (channel === this.globalChannel) {
                this._localBroadcast(data.packet, data.opts)
            } else if (channel.includes(':room:')) {
                const roomName = channel.split(':').pop()
                this._localBroadcast(data.packet, { ...data.opts, rooms: [roomName] })
            }
        })
    }

    /**
     * Гранулярна підписка: підписуємось на канал Redis,
     * тільки якщо в кімнаті з'явився перший локальний юзер.
     */
    async addAll(id, rooms) {
        super.addAll(id, rooms)

        for (const room of rooms) {
            const channel = `nexus:${this.nsp.name}:room:${room}`
            const count = (this.subscribedChannels.get(channel) || 0) + 1
            this.subscribedChannels.set(channel, count)

            if (count === 1) {
                await this.sub.subscribe(channel)
            }
        }
    }

    async del(id, room) {
        super.del(id, room)

        const channel = `nexus:${this.nsp.name}:room:${room}`
        const count = this.subscribedChannels.get(channel)

        if (count) {
            if (count <= 1) {
                this.subscribedChannels.delete(channel)
                await this.subClient.unsubscribe(channel)
            } else {
                this.subscribedChannels.set(channel, count - 1)
            }
        }
    }

    /**
     * Розсилка: якщо вказані кімнати — шлемо в їх канали,
     * якщо ні — в глобальний канал неймспейсу.
     */
    broadcast(packet, opts = {}) {
        const payload = JSON.stringify({
            packet,
            opts,
            serverId: this.serverId,
        })

        const rooms = opts.rooms || []
        if (rooms.length > 0) {
            for (const room of rooms) {
                this.pub.publish(`nexus:${this.nsp.name}:room:${room}`, payload)
            }
        } else {
            this.pub.publish(this.globalChannel, payload)
        }

        // Локальна розсилка для своїх клієнтів (Sync)
        this._localBroadcast(packet, opts)
    }

    /**
     * Агрегація сокетів з усього кластера
     */
    async fetchSockets() {
        const requestId = uuidv4()
        const replyTo = `nexus:res:${requestId}`
        const responses = []
        const tempSub = new Redis(this.nsp.server.options.redis)

        await tempSub.subscribe(replyTo)

        // Дізнаємось кількість вузлів через PUBLISH
        const nodesCount = await this.pub.publish(
            this.requestChannel,
            JSON.stringify({
                requestId,
                replyTo,
            }),
        )

        // Якщо ми один сервер у кластері
        if (nodesCount <= 1) {
            tempSub.disconnect()
            return super.fetchSockets()
        }

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                tempSub.disconnect()
                resolve(responses.flat())
            }, 3000)

            tempSub.on('message', (chan, msg) => {
                const data = JSON.parse(msg)
                responses.push(data.sockets)

                if (responses.length >= nodesCount) {
                    clearTimeout(timeout)
                    tempSub.disconnect()
                    resolve(responses.flat())
                }
            })
        })
    }

    /**
     * Відповідь на запит від іншого вузла кластера
     */
    async _handleClusterRequest({ replyTo }) {
        const localSockets = Array.from(this.nsp.sockets.values()).map((s) => ({
            id: s.id,
            rooms: Array.from(s.rooms),
            data: s.data || {},
        }))

        await this.pub.publish(
            replyTo,
            JSON.stringify({
                serverId: this.serverId,
                sockets: localSockets,
            }),
        )
    }
}
