import { BaseAdapter } from './BaseAdapter.js'

/**
 * Адаптер для масштабування WebSocket-кімнат за допомогою Redis Pub/Sub.
 * Дозволяє декільком Node.js серверам синхронізувати розсилки між собою.
 * @extends BaseAdapter
 */
export class RedisAdapter extends BaseAdapter {
    /**
     * Створює екземпляр RedisAdapter.
     * @param {string} nspName - Унікальне ім'я простору імен.
     * @param {object} redisClients - Об'єкти підключення до Redis.
     * @param {any} redisClients.pubClient - Клієнт для публікації повідомлень (ioredis або redis).
     * @param {any} redisClients.subClient - Клієнт для підписки на канали (ioredis oбо redis).
     */
    constructor(nspName, { pubClient, subClient }) {
        super(nspName)

        /** @type {any} */
        this.pubClient = pubClient
        /** @type {any} */
        this.subClient = subClient

        /** @type {Map<string, any>} Локальні об'єкти сокетів на ЦЬОМУ сервері: SocketId -> Socket */
        this.sockets = new Map()
        /** @type {Map<string, Set<string>>} Локальні кімнати та ID сокетів у них: RoomName -> Set(SocketId) */
        this.rooms = new Map()
        /** @type {Map<string, Set<string>>} Список кімнат для кожного локального сокета: SocketId -> Set(RoomName) */
        this.sids = new Map()
        /** @type {Map<string, NodeJS.Timeout>} Таймери відкладеного видалення сокетів */
        this.graceTimers = new Map()

        /** @type {string} Унікальний префікс каналу для Pub/Sub */
        this.channel = `ws-bridge:${this.nspName}`

        // Автоматично підписуємося на канал цього простору імен при створенні адаптера
        this.#setupSubClient()
    }

    /**
     * Налаштовує підписку на канал Redis та обробку вхідних повідомлень від інших серверів.
     * @private
     */
    #setupSubClient() {
        this.subClient.subscribe(this.channel, (err) => {
            if (err) console.error(`[RedisAdapter] Помилка підписки на канал ${this.channel}:`, err)
        })

        this.subClient.on('message', (channel, message) => {
            if (channel !== this.channel) return

            try {
                const { roomName, packet, opts } = JSON.parse(message)
                // Викликаємо ЛОКАЛЬНУ розсилку для тих сокетів, які фізично підключені до цієї ноди
                this.#localBroadcast(roomName, packet, opts)
            } catch (e) {
                console.error('[RedisAdapter] Помилка десеріалізації Pub/Sub повідомлення:', e)
            }
        })
    }

    /**
     * Реєструє об'єкт сокета на поточному сервері.
     * @param {any} socket - Об'єкт сокет-з'єднання.
     */
    registerSocket(socket) {
        if (!socket || typeof socket.id !== 'string') return

        const socketId = socket.id

        const timerId = this.graceTimers.get(socketId)
        if (timerId) {
            clearTimeout(timerId)
            this.graceTimers.delete(socketId)
        }

        this.sockets.set(socketId, socket)
    }

    /**
     * Додає ЛОКАЛЬНИЙ сокет до однієї конкретної кімнати за його ID.
     * @param {string} socketId - Ідентифікатор сокета.
     * @param {string} roomName - Назва кімнати.
     */
    add(socketId, roomName) {
        if (typeof socketId !== 'string' || typeof roomName !== 'string') return

        const timerId = this.graceTimers.get(socketId)
        if (timerId) {
            clearTimeout(timerId)
            this.graceTimers.delete(socketId)
        }

        let socketRooms = this.sids.get(socketId)
        if (!socketRooms) {
            socketRooms = new Set()
            this.sids.set(socketId, socketRooms)
        }
        socketRooms.add(roomName)

        let roomSocketIds = this.rooms.get(roomName)
        if (!roomSocketIds) {
            roomSocketIds = new Set()
            this.rooms.set(roomName, roomSocketIds)
        }
        roomSocketIds.add(socketId)
    }

    /**
     * Додає ЛОКАЛЬНИЙ сокет до масиву кімнат за його ID.
     * @param {string} socketId - Ідентифікатор сокета.
     * @param {string[]} rooms - Масив назв кімнат.
     */
    addAll(socketId, rooms) {
        if (typeof socketId !== 'string') return

        if (!Array.isArray(rooms)) {
            if (typeof rooms === 'string') this.add(socketId, rooms)
            return
        }

        for (const roomName of rooms) {
            this.add(socketId, roomName)
        }
    }

    /**
     * Видаляє ЛОКАЛЬНИЙ сокет із конкретної кімнати.
     * @param {string} socketId - Ідентифікатор сокета.
     * @param {string} roomName - Назва кімнати.
     */
    del(socketId, roomName) {
        if (typeof socketId !== 'string' || typeof roomName !== 'string') return

        const roomSocketIds = this.rooms.get(roomName)
        if (roomSocketIds) {
            roomSocketIds.delete(socketId)
            if (roomSocketIds.size === 0) {
                this.rooms.delete(roomName)
            }
        }

        const socketRooms = this.sids.get(socketId)
        if (socketRooms) {
            socketRooms.delete(roomName)
            if (socketRooms.size === 0) {
                this.sids.delete(socketId)
            }
        }
    }

    /**
     * Запускає процес видалення сокета з усіх кімнат (можливо з відстрочкою graceMs).
     * @param {string} socketId - Ідентифікатор сокета.
     * @param {number} [graceMs=0] - Час відстрочки у мілісекундах.
     * @param {Function|null} [onFinalCleanup=null] - Коллбек після очищення.
     */
    delAll(socketId, graceMs = 0, onFinalCleanup = null) {
        if (typeof socketId !== 'string') return

        const parsedGraceMs = Number(graceMs) || 0

        if (parsedGraceMs <= 0) {
            this.#executeFinalCleanup(socketId)
            if (typeof onFinalCleanup === 'function') onFinalCleanup()
            return
        }

        const timerId = setTimeout(() => {
            this.#executeFinalCleanup(socketId)
            this.graceTimers.delete(socketId)
            if (typeof onFinalCleanup === 'function') onFinalCleanup()
        }, parsedGraceMs)

        this.graceTimers.set(socketId, timerId)
    }

    /**
     * Внутрішній приватний метод для повного вичищення сокета з поточної ноди.
     * @private
     * @param {string} socketId - Ідентифікатор сокета.
     */
    #executeFinalCleanup(socketId) {
        const socketRooms = this.sids.get(socketId)
        if (socketRooms) {
            for (const roomName of socketRooms) {
                const roomSocketIds = this.rooms.get(roomName)
                if (roomSocketIds) {
                    roomSocketIds.delete(socketId)
                    if (roomSocketIds.size === 0) {
                        this.rooms.delete(roomName)
                    }
                }
            }
        }
        this.sids.delete(socketId)
        this.sockets.delete(socketId)
    }

    /**
     * ГЛОБАЛЬНА розсилка: публікує пакет у Redis, щоб усі сервери отримали його.
     * @param {string|null} roomName - Назва кімнати або null для розсилки усім у цьому namespace.
     * @param {any} packet - Об'єкт даних для відправки.
     * @param {object} [opts={}] - Опції розсилки.
     */
    broadcast(roomName, packet, opts = {}) {
        const message = JSON.stringify({ roomName, packet, opts })
        // Публікуємо повідомлення в Redis шину
        this.pubClient.publish(this.channel, message).catch((err) => {
            console.error('[RedisAdapter] Помилка публікації в Redis:', err)
            // Фолбек: якщо Redis впав, робимо розсилку хоча б локальним клієнтам на цьому сервері
            this.#localBroadcast(roomName, packet, opts)
        })
    }

    /**
     * Внутрішній метод для відправки повідомлень СУТО локальним сокетам цієї ноди.
     * @private
     * @param {string|null} roomName - Назва кімнати або null.
     * @param {any} packet - Об'єкт даних.
     * @param {object} opts - Опції розсилки.
     */
    #localBroadcast(roomName, packet, opts = {}) {
        const payload = JSON.stringify(packet)

        // Локальна розсилка усім підключеним до цієї ноди
        if (roomName === null) {
            for (const [socketId, socket] of this.sockets.entries()) {
                if (socketId === opts?.except) continue
                if (opts?.volatile && socket?.rawWs?.bufferedAmount > 0) continue
                if (socket?.rawWs?.readyState === 1) socket.rawWs.send(payload)
            }
            return
        }

        // Локальна розсилка в конкретну кімнату на цій ноді
        const roomSocketIds = this.rooms.get(roomName)
        if (!roomSocketIds) return

        for (const socketId of roomSocketIds) {
            if (socketId === opts?.except) continue

            const socket = this.sockets.get(socketId)
            if (!socket) continue

            if (opts?.volatile && socket?.rawWs?.bufferedAmount > 0) continue
            if (socket?.rawWs?.readyState === 1) socket.rawWs.send(payload)
        }
    }

    /**
     * Отримує список локальних кімнат та ID сокетів на цьому сервері.
     * @async
     * @returns {Promise<Record<string, string[]>>}
     */
    async fetchSockets() {
        const localData = {}
        for (const [roomName, socketIdsSet] of this.rooms.entries()) {
            localData[roomName] = Array.from(socketIdsSet)
        }
        return localData
    }
}
