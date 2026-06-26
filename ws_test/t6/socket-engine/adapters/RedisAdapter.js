import { BaseAdapter } from './BaseAdapter.js'

/**
 * Кластерний Redis-адаптер з підтримкою глобальних запитів, подій присутності та логування.
 * Оптимізований для уникнення дублювання об'єктів сокетів та повторних пошуків у Map.
 * @extends BaseAdapter
 */
export class RedisAdapter extends BaseAdapter {
    /**
     * Створює екземпляр RedisAdapter.
     * @param {string} nspName - Назва простору імен.
     * @param {any} pubClient - Redis клієнт для публікації.
     * @param {any} subClient - Redis клієнт для підписки.
     * @param {object} [options] - Додаткові опції адаптера.
     * @param {any} [options.logger] - Опціональний екземпляр логера (наприклад, pino або winston).
     */
    constructor(nspName, pubClient, subClient, options = {}) {
        super(nspName)

        // this.pubClient = options.pubClient
        // this.subClient = options.subClient
        // this.logger = options.logger

        this.pubClient = pubClient
        this.subClient = subClient

        // Ініціалізація опціонального логера (перевіряємо метод child, якщо немає — беремо дефолтний або null-логер)
        const baseLogger = options.logger
        this.logger = baseLogger?.child?.({ component: '[WS RedisAdapter]', nsp: nspName }) ??
            baseLogger ?? {
                info: () => {},
                error: () => {},
                warn: () => {},
                debug: () => {},
            }

        /** @type {Map<string, any>} Локальні об'єкти сокетів на цій ноді: SocketId -> Socket */
        this.sockets = new Map()
        /** @type {Map<string, Set<string>>} Локальні кімнати: RoomName -> Set(SocketId) */
        this.rooms = new Map()
        /** @type {Map<string, Set<string>>} Список кімнат для локального сокета: SocketId -> Set(RoomName) */
        this.sids = new Map()
        /** @type {Map<string, NodeJS.Timeout>} Таймери grace-періоду */
        this.graceTimers = new Map()

        // --- НОВА СТРУКТУРА ДЛЯ CONNECTION RECOVERY ---
        /** @type {Map<string, Array<{packet: object, id: string}>>} Буфери повідомлень кімнат: RoomName -> Array */
        this.roomBuffers = new Map()
        this.maxBufferSize = options.maxBufferSize || 100

        // Унікальний ідентифікатор цього сервера у кластері
        this.serverId = `srv_${Math.random().toString(36).substring(2, 9)}`

        // Канали для комунікації всередині кластера Redis
        this.broadcastChannel = `ws-nsp:${nspName}:broadcast`
        this.requestChannel = `ws-nsp:${nspName}:request`
        this.responseChannel = `ws-nsp:${nspName}:response`
        this.clusterPresenceChannel = `ws-nsp:${nspName}:presence`

        /** @type {Map<string, {responses: any[], timer: NodeJS.Timeout}>} Активні міжсерверні запити */
        this.activeRequests = new Map()

        this.#initRedis().catch((err) => {
            this.logger?.error?.('Помилка ініціалізації Redis підписок:', err)
        })
    }

    /**
     * Ініціалізує підписки на канали Redis Pub/Sub та обробники повідомлень.
     * @private
     * @async
     */
    async #initRedis() {
        // 1. Обробка розсилок від інших серверів
        await this.subClient.subscribe(this.broadcastChannel, (msg) => {
            try {
                const { roomName, packet, opts, originServerId } = JSON.parse(msg)

                // ЗАПИС В БУФЕР ДЛЯ RECOVERY: записуємо в пам'ять цієї ноди повідомлення,
                // які прилетіли з кластера, щоб наші локальні клієнти могли їх відновити у разі реконнекту
                if (roomName && !opts?.volatile) {
                    this.#pushToRoomBuffer(roomName, packet)
                }

                if (originServerId === this.serverId) return

                this.logger?.debug?.(
                    `Отримано broadcast з кластера від ${originServerId} для кімнати: ${roomName}`,
                )
                this.localBroadcast(roomName, packet, opts)
            } catch (err) {
                this.logger?.error?.('Помилка обробки кластерного broadcast:', err)
            }
        })

        // 2. Обробка подій входу/виходу з кімнат на інших серверах
        await this.subClient.subscribe(this.clusterPresenceChannel, (msg) => {
            try {
                const { action, socketId, roomName, originServerId } = JSON.parse(msg)

                if (originServerId === this.serverId) return

                if (this.nsp?.globalEvents) {
                    this.nsp.globalEvents.emit(`cluster_${action}`, {
                        socketId,
                        roomName,
                        remoteServerId: originServerId,
                    })
                }
            } catch (err) {
                this.logger?.error?.('Помилка обробки події присутності кластера:', err)
            }
        })

        // 3. Обробка запитів даних (наприклад, від fetchSockets) від інших серверів
        await this.subClient.subscribe(this.requestChannel, (msg) => {
            try {
                const { requestId, originServerId } = JSON.parse(msg)

                if (originServerId === this.serverId) return

                const localData = {}
                for (const [roomName, socketIdsSet] of this.rooms.entries()) {
                    localData[roomName] = Array.from(socketIdsSet)
                }

                this.#safePublish(this.responseChannel, {
                    requestId,
                    serverId: this.serverId,
                    data: localData,
                })
            } catch (err) {
                this.logger?.error?.('Помилка обробки кластерного запиту:', err)
            }
        })

        // 4. Збір відповідей на наші власні запити
        await this.subClient.subscribe(this.responseChannel, (msg) => {
            try {
                const { requestId, data } = JSON.parse(msg)

                const record = this.activeRequests.get(requestId)
                if (record) {
                    record.responses.push(data)
                }
            } catch (err) {
                this.logger?.error?.('Помилка обробки кластерної відповіді:', err)
            }
        })
    }

    /**
     * Записує надісланий пакет у локальний буфер кімнати (для майбутнього відновлення сесії).
     * @private
     */
    #pushToRoomBuffer(roomName, packet) {
        const targetRooms = Array.isArray(roomName) ? roomName : [roomName]

        for (const room of targetRooms) {
            let buffer = this.roomBuffers.get(room)
            if (!buffer) {
                buffer = []
                this.roomBuffers.set(room, buffer)
            }

            buffer.push({ packet, id: packet.meta?.id })

            // Якщо буфер переповнений, видаляємо найстаріше повідомлення
            if (buffer.length > this.maxBufferSize) {
                buffer.shift()
            }
        }
    }

    /**
     * Повертає масив повідомлень, які пропустив клієнт у конкретній кімнаті.
     * @param {string} roomName - Назва кімнати.
     * @param {string} lastMsgId - ID останнього отриманого клієнтом повідомлення.
     * @returns {object[]} Масив пропущених пакетів повідомлень.
     */
    getMissedMessages(roomName, lastMsgId) {
        const buffer = this.roomBuffers.get(roomName)
        if (!buffer || !lastMsgId) return []

        // Шукаємо індекс повідомлення, яке користувач отримав перед збоєм
        const index = buffer.findIndex((m) => m.id === lastMsgId)

        // Якщо повідомлення не знайдено (воно застаріло і вже вилетіло з циклічного буфера)
        if (index === -1) {
            this.logger?.warn?.(
                `[Recovery] Повідомлення ${lastMsgId} не знайдено в буфері кімнати ${roomName}. Історія застаріла.`,
            )
            return []
        }

        // Повертаємо всі пакети, які були записані ПІСЛЯ цього повідомлення
        return buffer.slice(index + 1).map((m) => m.packet)
    }

    /**
     * Допоміжний метод для безпечної публікації об'єктів у Redis.
     * @private
     */
    #safePublish(channel, payload) {
        // Перевіряємо статус підключення (підтримує як node-redis [.isOpen], так і ioredis [.status])
        const isClientReady = this.pubClient?.isOpen || this.pubClient?.status === 'ready'

        if (isClientReady) {
            this.pubClient.publish(channel, JSON.stringify(payload)).catch((err) => {
                this.logger?.error?.(`Помилка публікації в канал Redis ${channel}:`, err)
            })
        } else {
            this.logger?.warn?.(`Redis клієнт не готовий. Пропущено публікацію в канал ${channel}`)
        }
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
     * Додає ЛОКАЛЬНИЙ сокет до однієї конкретної кімнати за його ID (ОПТИМІЗОВАНО).
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

        // Оптимізована структура sids
        let socketRooms = this.sids.get(socketId)
        if (!socketRooms) {
            socketRooms = new Set()
            this.sids.set(socketId, socketRooms)
        }
        socketRooms.add(roomName)

        // Оптимізована структура rooms (зберігає лише ID, а не об'єкт сокета!)
        let roomSocketIds = this.rooms.get(roomName)
        if (!roomSocketIds) {
            roomSocketIds = new Set()
            this.rooms.set(roomName, roomSocketIds)
        }
        roomSocketIds.add(socketId)

        this.#publishPresence('join', socketId, roomName)
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
     * Видаляє ЛОКАЛЬНИЙ сокет із конкретної кімнати (ОПТИМІЗОВАНО).
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
                // Очищаємо застарілий буфер повідомлень кімнати, якщо в ній більше нікого немає
                this.roomBuffers.delete(roomName)
            }
            this.#publishPresence('leave', socketId, roomName)
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
     * Внутрішній приватний метод для повного вичищення сокета з поточної ноди (ОПТИМІЗОВАНО).
     * @private* @param {string} socketId - Ідентифікатор сокета.
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
                        this.roomBuffers.delete(roomName)
                    }

                    this.#publishPresence('leave', socketId, roomName)
                }
            }
        }

        this.sids.delete(socketId)
        this.sockets.delete(socketId)
    }

    /**
     * Публікує статус присутності в Redis кластер.
     * @private
     */
    #publishPresence(action, socketId, roomName) {
        this.#safePublish(this.clusterPresenceChannel, {
            action,
            socketId,
            roomName,
            originServerId: this.serverId,
        })
    }
    /**
     * ГЛОБАЛЬНА розсилка: відправляє локально ТА публікує повідомлення для інших нод у Redis.
     * @param {string|null} roomName - Назва кімнати або null для розсилки усім.
     * @param {any} packet - Об'єкт даних для відправки.
     * @param {object} [opts={}] - Опції розсилки.
     */
    broadcast(roomName, packet, opts = {}) {
        // Спочатку миттєво доставляємо клієнтам на ЦЬОМУ сервері
        this.localBroadcast(roomName, packet, opts)
        // Потім транслюємо іншим серверам у кластері
        this.#safePublish(this.broadcastChannel, {
            roomName,
            packet,
            opts,
            originServerId: this.serverId,
        })
    }
    /**
     * ЛОКАЛЬНА розсилка суто для сокетів, які фізично підключені до цього сервера (ОПТИМІЗОВАНО).
     * @param {string|null} roomName - Назва кімнати або null.
     * @param {any} packet - Об'єкт даних.
     * @param {object} [opts={}] - Опції розсилки.
     */
    localBroadcast(roomName, packet, opts = {}) {
        const payload = JSON.stringify(packet)

        // Локальна розсилка взагалі всім підключеним до цієї ноди сокетам
        if (roomName === null) {
            const sentSockets = new Set()

            for (const [socketId, socket] of this.sockets.entries()) {
                if (sentSockets.has(socketId)) continue

                if (socketId === opts?.except) continue
                if (opts?.volatile && socket?.rawWs?.bufferedAmount > 0) continue

                if (socket?.rawWs?.readyState === 1) {
                    socket.rawWs.send(payload)
                    sentSockets.add(socketId)
                }
            }
            return
        }

        // 2. Обробка розсилки у список кімнат (масив)
        // Якщо прийшов один рядок, загортаємо його в масив
        const targetRooms = Array.isArray(roomName) ? roomName : [roomName]

        // Set для збору унікальних ID сокетів з усіх вказаних кімнат
        const uniqueSocketIds = new Set()

        for (const room of targetRooms) {
            const roomSocketIds = this.rooms.get(room)
            if (!roomSocketIds) continue

            for (const id of roomSocketIds) {
                uniqueSocketIds.add(id) // Завдяки Set кожен ID збережеться лише ОДИН раз
            }
        }

        // 3. Безпечно відправляємо повідомлення унікальним клієнтам
        for (const socketId of uniqueSocketIds) {
            if (socketId === opts?.except) continue

            const socket = this.sockets.get(socketId)
            if (!socket) continue

            if (opts?.volatile && socket?.rawWs?.bufferedAmount > 0) continue
            if (socket?.rawWs?.readyState === 1) socket.rawWs.send(payload)
        }
    }

    /**
     * Збирає інформацію про абсолютно ВСІ кімнати та ВСІХ користувачів по всьому Redis кластеру.
     * @async* @returns {Promise<Record<string, string[]>>} Повна карта кімнат кластера { room: [ids] }
     */
    async fetchSockets() {
        return new Promise((resolve) => {
            const requestId = `req_${Math.random().toString(36).substring(2, 9)}`
            const record = { responses: [], timer: null }
            this.activeRequests.set(requestId, record)

            // Чекаємо відповіді від інших нод рівно (N=250) мілісекунд
            record.timer = setTimeout(() => {
                this.activeRequests.delete(requestId)

                // Крок 1: Беремо наші локальні кімнати
                const clusterRooms = {}
                for (const [roomName, socketIdsSet] of this.rooms.entries()) {
                    clusterRooms[roomName] = Array.from(socketIdsSet)
                }

                // Крок 2: Додаємо унікальні ID сокетів, отримані від віддалених серверів
                for (const remoteData of record.responses) {
                    for (const [roomName, userIds] of Object.entries(remoteData)) {
                        if (!clusterRooms[roomName]) {
                            clusterRooms[roomName] = []
                        }

                        // Об'єднуємо масиви та фільтруємо дублікати через Set
                        clusterRooms[roomName] = Array.from(
                            new Set([...clusterRooms[roomName], ...userIds]),
                        )
                    }
                }
                resolve(clusterRooms)
            }, 250)

            // Надсилаємо запит усім нодам через Redis
            this.#safePublish(this.requestChannel, { requestId, originServerId: this.serverId })
        })
    }
}
