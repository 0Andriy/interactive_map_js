import { BaseAdapter } from './BaseAdapter.js'
import Redis from 'ioredis'

export class RedisAdapter extends BaseAdapter {
    constructor(namespace) {
        super(namespace)

        // Двонаправлені локальні індекси для O(1) операцій на поточній ноді
        this.rooms = new Map()
        this.sids = new Map()

        const redisOptions = namespace.server.opts.redis || { host: '127.0.0.1', port: 6379 }

        // Redis вимагає окремих клієнтів для публікації та підписки
        this.pubClient = new Redis(redisOptions)
        this.subClient = new Redis(redisOptions)

        this.channelName = `ws-bridge:${this.ns.name}`
        this.initRedis()
    }

    initRedis() {
        // Підписуємось на міжсерверний канал цього простору імен
        this.subClient.subscribe(this.channelName)

        this.subClient.on('message', (channel, message) => {
            if (channel !== this.channelName) return

            try {
                const { msgId, packet, opts } = JSON.parse(message)

                // Важливо: за замовчуванням виконуємо ЛОКАЛЬНИЙ бродкаст на цій ноді,
                // щоб не піти в нескінченний цикл між серверами.
                this.localBroadcast(packet, opts)
            } catch (e) {
                this.ns.emit('error', e)
            }
        })
    }

    // Локальні методи керування кімнатами (O(1))
    addAll(id, rooms) {
        if (!this.sids.has(id)) this.sids.set(id, new Set())
        for (const room of rooms) {
            if (!this.rooms.has(room)) this.rooms.set(room, new Set())
            this.rooms.get(room).add(id)
            this.sids.get(id).add(room)
        }
    }

    del(id, room) {
        if (this.rooms.has(room)) {
            this.rooms.get(room).delete(id)
            if (this.rooms.get(room).size === 0) this.rooms.delete(room)
        }
        if (this.sids.has(id)) {
            this.sids.get(id).delete(room)
            if (this.sids.get(id).size === 0) this.sids.delete(id)
        }
    }

    delAll(id) {
        const socketRooms = this.sids.get(id)
        if (!socketRooms) return
        for (const room of socketRooms) {
            if (this.rooms.has(room)) {
                this.rooms.get(room).delete(id)
                if (this.rooms.get(room).size === 0) this.rooms.delete(room)
            }
        }
        this.sids.delete(id)
    }

    // Глобальний еміт (надсилається в Redis для всіх нод)
    broadcast(packet, opts = {}) {
        // Якщо встановлено прапорець .local, не шлемо в Redis, а відправляємо лише сокетам цієї ноди
        if (opts.flags && opts.flags.local) {
            this.localBroadcast(packet, opts)
            return
        }

        const payload = JSON.stringify({
            msgId: crypto.randomUUID(),
            packet,
            opts,
        })

        // Публікуємо в шину маштабування
        this.pubClient.publish(this.channelName, payload)
    }

    // Допоміжний метод: відправка сокетам, які фізично підключені до цього процесу
    localBroadcast(packet, opts = {}) {
        const { except = [], rooms = [] } = opts
        const targets = new Set()

        if (rooms.length > 0) {
            for (const room of rooms) {
                const clients = this.rooms.get(room)
                if (clients) clients.forEach((id) => targets.add(id))
            }
        } else {
            this.ns.sockets.forEach((_, id) => targets.add(id))
        }

        // Крім вказаних ID
        except.forEach((id) => targets.delete(id))

        for (const id of targets) {
            const socket = this.ns.sockets.get(id)
            if (socket) socket.sendRaw(packet)
        }
    }

    // Збір сокетів працює локально (для глобального збору потрібна складна логіка запитів-відповідей через Redis RPC,
    // оригінальний Socket.IO робить саме так при відсутності прапорця local).
    async fetchSockets(opts = {}) {
        const { rooms = [], except = [] } = opts
        const targets = new Set()

        if (rooms.length > 0) {
            for (const room of rooms) {
                const clients = this.rooms.get(room)
                if (clients) clients.forEach((id) => targets.add(id))
            }
        } else {
            this.ns.sockets.forEach((_, id) => targets.add(id))
        }

        except.forEach((id) => targets.delete(id))
        return Array.from(targets)
    }
}
