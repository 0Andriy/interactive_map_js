import { BaseAdapter } from './BaseAdapter.js'

/**
 * Адаптер для керування WebSocket-сесіями та кімнатами за допомогою Redis.
 * Забезпечує синхронізацію між кількома серверами (горизонтальне масштабування).
 */
export class RedisAdapter extends BaseAdapter {
    /**
     * Створює екземпляр RedisAdapter.
     * @param {string} nspName - Унікальне ім'я простору імен.
     * @param {object} pubClient - Ініціалізований клієнт Redis для публікації та команд.
     * @param {object} subClient - Ініціалізований клієнт Redis для підписок (Pub/Sub).
     */
    constructor(nspName, pubClient, subClient) {
        super(nspName)

        this.pubClient = pubClient
        this.subClient = subClient

        // Генеруємо унікальний ID для цього Node.js процесу
        this.serverId = crypto.randomUUID()

        // Локальні структури сокетів, які підключені САМЕ ДО ЦЬОГО сервера
        /** @type {Map<string, any>} LocalSocketId -> Socket */
        this.localSockets = new Map()
        /** @type {Map<string, Set<string>>} RoomName -> Set(LocalSocketId) */
        this.localRooms = new Map()
        /** @type {Map<string, Set<string>>} LocalSocketId -> Set(RoomName) */
        this.localSids = new Map()

        // Префікси ключі для Redis, щоб уникнути конфліктів даних
        this.redisKeyPrefix = `ws:${this.nspName}`
        this.pubSubChannel = `ws-pubsub:${this.nspName}`

        // Підписуємося на міжсерверний канал зв'язку
        this.#initPubSub()
    }

    /**
     * Ініціалізація та прослуховування Pub/Sub каналу Redis.
     * @private
     */
    async #initPubSub() {
        await this.subClient.subscribe(this.pubSubChannel, (message) => {
            try {
                const { msgServerId, roomName, payload, opts } = JSON.parse(message)

                // Ігноруємо повідомлення, які згенерував цей самий сервер
                if (msgServerId === this.serverId) return

                // Викликаємо локальну розсилку для сокетів на цьому сервері
                this.#localBroadcast(roomName, payload, opts)
            } catch (err) {
                console.error('[RedisAdapter] Pub/Sub message parsing error:', err)
            }
        })
    }

    /**
     * Гарантує наявність унікального ID повідомлення всередині пакета.
     * @private
     * @param {any} packet
     * @returns {string} ID повідомлення.
     */
    #ensureMessageId(packet) {
        if (typeof packet !== 'object' || packet === null) {
            return crypto.randomUUID()
        }
        if (!packet.meta) packet.meta = {}
        if (!packet.meta.id) packet.meta.id = crypto.randomUUID()
        return packet.meta.id
    }

    /**
     * Реєструє об'єкт сокета ЛОКАЛЬНО на цьому сервері.
     */
    registerSocket(socket) {
        if (!socket?.id || typeof socket.id !== 'string') return
        this.localSockets.set(socket.id, socket)
    }

    /**
     * Додає сокет до кімнати (і в Redis, і локально).
     */
    async add(socketId, roomName) {
        if (typeof socketId !== 'string' || typeof roomName !== 'string') return

        // 1. Локальний запис (якщо сокет підключений до цього інстансу)
        if (this.localSockets.has(socketId)) {
            let socketRooms = this.localSids.get(socketId)
            if (!socketRooms) {
                socketRooms = new Set()
                this.localSids.set(socketId, socketRooms)
            }
            socketRooms.add(roomName)

            let roomSocketIds = this.localRooms.get(roomName)
            if (!roomSocketIds) {
                roomSocketIds = new Set()
                this.localRooms.set(roomName, roomSocketIds)
            }
            roomSocketIds.add(socketId)
        }

        // 2. Глобальний запис у загальний Redis (використовуємо Set)
        const roomKey = `${this.redisKeyPrefix}:room:${roomName}`
        const sidKey = `${this.redisKeyPrefix}:sid:${socketId}`

        await this.pubClient.multi().sadd(roomKey, socketId).sadd(sidKey, roomName).exec()
    }

    /**
     * Додає сокет до кількох кімнат одночасно.
     */
    async addAll(socketId, rooms) {
        if (typeof socketId !== 'string') return

        if (!Array.isArray(rooms)) {
            if (typeof rooms === 'string') await this.add(socketId, rooms)
            return
        }

        for (const roomName of rooms) {
            await this.add(socketId, roomName)
        }
    }

    /**
     * Видаляє сокет із конкретної кімнати.
     */
    async del(socketId, roomName) {
        if (typeof socketId !== 'string' || typeof roomName !== 'string') return

        // 1. Локальне видалення
        const roomSocketIds = this.localRooms.get(roomName)
        if (roomSocketIds) {
            roomSocketIds.delete(socketId)
            if (roomSocketIds.size === 0) this.localRooms.delete(roomName)
        }

        const socketRooms = this.localSids.get(socketId)
        if (socketRooms) {
            socketRooms.delete(roomName)
            if (socketRooms.size === 0) this.localSids.delete(socketId)
        }

        // 2. Глобальне видалення з Redis
        const roomKey = `${this.redisKeyPrefix}:room:${roomName}`
        const sidKey = `${this.redisKeyPrefix}:sid:${socketId}`

        await this.pubClient.multi().srem(roomKey, socketId).srem(sidKey, roomName).exec()
    }

    /**
     * Видаляє сокет з усіх кімнат (зазвичай при повному дисконекті).
     * Якщо потрібен graceMs, його логіку краще реалізувати на рівні сесійного менеджера,
     * оскільки Redis має бути "single source of truth" актуального стану.
     */
    async delAll(socketId, graceMs = 0, onFinalCleanup = null) {
        if (typeof socketId !== 'string') return

        const executeCleanup = async () => {
            const sidKey = `${this.redisKeyPrefix}:sid:${socketId}`

            // Отримуємо всі кімнати користувача з Redis перед видаленням
            const rooms = await this.pubClient.smembers(sidKey)

            const multi = this.pubClient.multi()
            for (const roomName of rooms) {
                multi.srem(`${this.redisKeyPrefix}:room:${roomName}`, socketId)

                // Також чистимо локально
                const localRoom = this.localRooms.get(roomName)
                if (localRoom) {
                    localRoom.delete(socketId)
                    if (localRoom.size === 0) this.localRooms.delete(roomName)
                }
            }

            multi.del(sidKey)
            await multi.exec()

            // Очищаємо локальні Map
            this.localSids.delete(socketId)
            this.localSockets.delete(socketId)

            if (typeof onFinalCleanup === 'function') onFinalCleanup()
        }

        if (graceMs <= 0) {
            await executeCleanup()
        } else {
            setTimeout(executeCleanup, graceMs)
        }
    }

    /**
     * Глобальна трансляція. Надсилає повідомлення локальним сокетам
     * ТА публікує його в Redis Pub/Sub для інших серверів.
     */
    async broadcast(roomName, packet, opts = {}) {
        if (roomName !== null && !opts.volatile) {
            this.#ensureMessageId(packet)
        }

        const payload = typeof packet === 'string' ? packet : JSON.stringify(packet)

        // 1. Відправляємо сокетам, які підключені саме до поточного сервера
        this.#localBroadcast(roomName, payload, opts)

        // 2. Публікуємо в Redis Pub/Sub, щоб інші сервери теж відправили своїм клієнтам
        const pubSubMessage = JSON.stringify({
            msgServerId: this.serverId,
            roomName,
            payload,
            opts,
        })

        await this.pubClient.publish(this.pubSubChannel, pubSubMessage)
    }

    /**
     * Метод для розсилки повідомлень ТІЛЬКИ сокетам цього конкретного сервера.
     * @private
     */
    #localBroadcast(roomName, payload, opts = {}) {
        // Глобальна розсилка по всіх локальних сокетах
        if (roomName === null) {
            for (const [socketId, socket] of this.localSockets.entries()) {
                if (socketId === opts.except) continue
                if (opts.volatile && socket?.rawWs?.bufferedAmount > 0) continue

                if (socket?.rawWs?.readyState === 1) {
                    socket.rawWs.send(payload)
                }
            }
            return
        }

        const targetRooms = Array.isArray(roomName) ? roomName : [roomName]
        const uniqueLocalSocketIds = new Set()

        for (const room of targetRooms) {
            const localRoomSockets = this.localRooms.get(room)
            if (localRoomSockets) {
                for (const id of localRoomSockets) {
                    uniqueLocalSocketIds.add(id)
                }
            }
        }

        for (const socketId of uniqueLocalSocketIds) {
            if (socketId === opts.except) continue

            const socket = this.localSockets.get(socketId)
            if (!socket) continue

            if (opts.volatile && socket?.rawWs?.bufferedAmount > 0) continue
            if (socket?.rawWs?.readyState === 1) {
                socket.rawWs.send(payload)
            }
        }
    }

    /**
     * Отримує список МЕТАДАНИХ усіх сокетів у системі (з усіх серверів у кластері)
     * або фільтрує за конкретною кімнатою.
     * @param {string|null} [roomName=null]
     * @returns {Promise<Array<{id: string, customData: any}>>}
     */
    async fetchSockets(roomName = null) {
        let socketIds = []

        if (roomName) {
            // Отримуємо ID сокетів конкретної кімнати з Redis
            const roomKey = `${this.redisKeyPrefix}:room:${roomName}`
            socketIds = await this.pubClient.smembers(roomKey)
        } else {
            // Якщо кімнату не вказано, шукаємо всі унікальні ключі сидів
            const keys = await this.pubClient.keys(`${this.redisKeyPrefix}:sid:*`)
            socketIds = keys.map((key) => key.split(':').pop())
        }
        const result = []
        for (const id of socketIds) {
            // Якщо сокет підключений до нас локально — беремо повні дані
            if (this.localSockets.has(id)) {
                const s = this.localSockets.get(id)
                result.push({ id: s.id, user: s.user, handshake: s.handshake })
            } else {
                // Якщо сокет на іншому сервері — повертаємо хоча б його ID
                // (При бажанні, метадані сокетів теж можна зберігати в Redis як HASH)
                result.push({ id, user: null, note: 'Connected to another node' })
            }
        }
        return result
    }
    /*** Метод для Connection Recovery в Redis-середовищі.* Рекомендується використовувати Redis Streams або Redis Lists для буферизації.*/
    async getMissedMessages(roomName, lastMsgId) {
        // У розподілених системах буфер повідомлень зазвичай зберігається// у Redis Streams (XADD / XRANGE). Залишено як інтерфейсну заглушку.
        return []
    }
}
