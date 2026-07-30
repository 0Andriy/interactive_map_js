// src/adapters/RedisAdapter.js
import { BaseAdapter } from './BaseAdapter.js'
import Redis from 'ioredis'
import { crypto } from 'crypto'

export class RedisAdapter extends BaseAdapter {
    constructor(namespace) {
        super(namespace)

        // Локальні індекси кімнат на поточній ноді (O(1))
        this.rooms = new Map() // Кімната -> Set(socketId)
        this.sids = new Map() // socketId -> Set(roomName)

        const redisOptions = namespace.server.opts.redis || { host: '127.0.0.1', port: 6379 }

        // Окремі клієнти для публікації, підписки та RPC-запитів
        this.pubClient = new Redis(redisOptions)
        this.subClient = new Redis(redisOptions)

        // Унікальний ID цієї ноди в кластері
        this.nodeId = crypto.randomUUID()

        // Назви каналів для синхронізації
        this.msgChannel = `ws-bridge:${this.ns.name}:msg`
        this.requestChannel = `ws-bridge:${this.ns.name}:req`
        this.responseChannel = `ws-bridge:${this.ns.name}:res`

        // Мапа для очікування асинхронних відповідей від інших нод
        this.pendingRequests = new Map()

        this.initRedis()
    }

    initRedis() {
        // Підписуємось на канали подій та міжсерверних запитів
        this.subClient.subscribe(this.msgChannel, this.requestChannel, this.responseChannel)

        this.subClient.on('message', (channel, message) => {
            try {
                const data = JSON.parse(message)

                if (channel === this.msgChannel) {
                    this.handleBroadcastMessage(data)
                } else if (channel === this.requestChannel) {
                    this.handleRpcRequest(data)
                } else if (channel === this.responseChannel) {
                    this.handleRpcResponse(data)
                }
            } catch (e) {
                this.ns.emit('error', e)
            }
        })
    }

    // --- Робота з локальними кімнатами ---
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

    // --- Міжсерверний Broadcast (Публікація подій) ---
    broadcast(packet, opts = {}) {
        // Якщо увімкнено прапорець .local, відправляємо лише клієнтам на цій машині
        if (opts.flags && opts.flags.local) {
            this.localBroadcast(packet, opts)
            return
        }

        const payload = JSON.stringify({
            fromNode: this.nodeId,
            packet,
            opts,
        })

        this.pubClient.publish(this.msgChannel, payload)
    }

    handleBroadcastMessage(data) {
        // Ігноруємо власні повідомлення, оскільки ми вже відправили їх локально через спільну публікацію
        // (Оригінальний Socket.IO Redis адаптер публікує все в Redis, і кожна нода, включаючи відправника, шле локально)
        this.localBroadcast(data.packet, data.opts)
    }

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

        except.forEach((id) => targets.delete(id))

        for (const id of targets) {
            const socket = this.ns.sockets.get(id)
            if (socket) socket.sendRaw(packet)
        }
    }

    // --- Повноцінний Кластерний RPC для fetchSockets() ---
    async fetchSockets(opts = {}) {
        // Локальні сокети за поточними критеріями фільтрації
        const localSocketIds = this.localFetchSocketIds(opts)

        // Перетворюємо локальні ідентифікатори на проксі-об'єкти метаданих
        const localSocketsData = localSocketIds
            .map((id) => {
                const socket = this.ns.sockets.get(id)
                return socket ? this.mapSocketToMetadata(socket) : null
            })
            .filter(Boolean)

        // Якщо запрошено .local, не опитуємо інші сервери кластера
        if (opts.flags && opts.flags.local) {
            return localSocketsData
        }

        return new Promise((resolve) => {
            const requestId = crypto.randomUUID()

            const requestPayload = JSON.stringify({
                requestId,
                fromNode: this.nodeId,
                opts,
            })

            const responses = [localSocketsData] // Сюди збиратимуться масиви з усіх нод

            // Тайм-аут збору відповідей від сусідніх нод (наприклад, 250мс)
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId)

                // Об'єднуємо всі масиви сокетів в один плаский список
                resolve(responses.flat())
            }, 250)

            // Реєструємо хендлер очікування відповіді
            this.pendingRequests.set(requestId, {
                responses,
                timeout,
                resolve,
            })

            // Публікуємо запит у кластер
            this.pubClient.publish(this.requestChannel, requestPayload)
        })
    }

    // Метод, який виконується на ІНШИХ нодах при отриманні запиту
    handleRpcRequest(data) {
        if (data.fromNode === this.nodeId) return // Ігноруємо свій же запит

        const matchedIds = this.localFetchSocketIds(data.opts)
        const socketsMetadata = matchedIds
            .map((id) => {
                const socket = this.ns.sockets.get(id)
                return socket ? this.mapSocketToMetadata(socket) : null
            })
            .filter(Boolean)

        const responsePayload = JSON.stringify({
            requestId: data.requestId,
            fromNode: this.nodeId,
            sockets: socketsMetadata,
        })

        this.pubClient.publish(this.responseChannel, responsePayload)
    }

    // Метод обробки відповідей, що злітаються на ноду-ініціатор
    handleRpcResponse(data) {
        const requestContext = this.pendingRequests.get(data.requestId)
        if (!requestContext) return // Запит уже закрився за таймаутом

        requestContext.responses.push(data.sockets)
    }

    // Хелпер для локальної фільтрації ID
    localFetchSocketIds(opts = {}) {
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

    // Конвертація нативного інстансу Socket у серіалізовані метадані для передачі між серверами
    mapSocketToMetadata(socket) {
        return {
            id: socket.id,
            handshake: socket.handshake,
            connectedAt: socket.connectedAt,
            rooms: Array.from(socket.rooms),
            // Проксі-метод еміту: якщо ми захочемо викликати emit на сокеті з іншої ноди
            // (Для цього в повному SDK робиться окремий RPC-канал для Socket.emit,
            // але в рамках архітектури адаптера достатньо передати базовий зліпок метаданих)
        }
    }
}
