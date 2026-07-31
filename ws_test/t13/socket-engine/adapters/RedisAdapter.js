import { InMemoryAdapter } from './InMemoryAdapter.js'

/**
 * @typedef {Object} RedisClusterMessage
 * @property {string} type - Тип команди (broadcast, join, leave, disconnect, fetch)
 * @property {string} msgId - Унікальний ID запиту для співставлення відповідей (для fetchSockets)
 * @property {string} [origin] - ID ноди, яка відправила запит
 * @property {any} [data] - Корисне навантаження команди
 */

/**
 * Redis адаптер для масштабування кімнат та сокетів на кілька серверів (кластер).
 * Наслідує InMemoryAdapter, оскільки кожна нода все одно має зберігати локальні сокети в пам'яті,
 * але перевизначає методи для синхронізації через Redis Pub/Sub.
 *
 * @extends InMemoryAdapter
 */
export class RedisAdapter extends InMemoryAdapter {
    /**
     * Створює екземпляр RedisAdapter.
     * @param {Object} namespace - Простір імен (Namespace).
     * @param {Object} pubClient - Redis клієнт для публікації (Publish).
     * @param {Object} subClient - Redis клієнт для підписки (Subscribe).
     * @param {Object} [opts={}] - Додаткові опції.
     * @param {string} [opts.key='socket.io'] - Префікс для каналів Redis.
     */
    constructor(namespace, pubClient, subClient, opts = {}) {
        // Ініціалізуємо локальні карти rooms та sids через InMemoryAdapter
        super(namespace)

        this.pubClient = pubClient
        this.subClient = subClient
        this.channel = opts.key || 'socket.io'

        // Унікальний ID цієї ноди сервера для ідентифікації в кластері
        this.uid = Math.random().toString(36).substring(2, 15)

        // Карта для збереження промісів очікування відповідей від інших нод
        this._requests = new Map()

        this._setupRequestChannel()
    }

    /**
     * Підписка на Redis канал та обробка системних повідомлень від інших нод кластера.
     * @private
     */
    async _setupRequestChannel() {
        await this.subClient.subscribe(this.channel, (message) => {
            try {
                /** @type {RedisClusterMessage} */
                const request = JSON.parse(message)

                if (request.origin === this.uid) return // Ігноруємо себе

                this._onMessage(request)
            } catch (err) {
                // Логування або ігнорування бітих бінарних даних
            }
        })
    }

    // /**
    //  * Маршрутизатор вхідних повідомлень кластера.
    //  * @private
    //  * @param {RedisClusterMessage} request
    //  */
    // _onMessage(request) {
    //     // Ігноруємо повідомлення, які ми самі ж і відправили
    //     if (request.origin === this.uid) return

    //     const { type, msgId, data } = request

    //     switch (type) {
    //         case 'broadcast':
    //             // Викликаємо локальний broadcast з InMemoryAdapter для наших локальних сокетів
    //             super.broadcast(data.packet, data.opts)
    //             break

    //         case 'socketsJoin':
    //             // Масово додаємо локальні сокети до кімнати без мережевого оверхеду
    //             super.socketsJoin(data.opts, data.rooms)
    //             break

    //         case 'socketsLeave':
    //             super.socketsLeave(data.opts, data.rooms)
    //             break

    //         case 'disconnectSockets':
    //             super.disconnectSockets(data.opts, data.close)
    //             break

    //         case 'fetchSocketsRequest':
    //             // Інша нода просить список сокетів. Збираємо свої локальні.
    //             this._handleFetchRequest(msgId, data.opts)
    //             break

    //         case 'fetchSocketsResponse':
    //             // Отримали відповідь від однієї з нод кластера на наш запит
    //             this._handleFetchResponse(msgId, data.sockets)
    //             break
    //     }
    // }

    /**
     * Маршрутизатор вхідних повідомлень кластера.
     * @private
     * @param {RedisClusterMessage} request
     */
    _onMessage(request) {
        // Ігноруємо повідомлення від самих себе
        if (request.origin === this.uid) return

        const { type, msgId, data } = request

        // Словник-мапа методів самого класу
        const methods = {
            broadcast: () => super.broadcast(data.packet, data.opts),
            socketsJoin: () => super.socketsJoin(data.opts, data.rooms),
            socketsLeave: () => super.socketsLeave(data.opts, data.rooms),
            disconnectSockets: () => super.disconnectSockets(data.opts, data.close),
            fetchSocketsRequest: () => this._handleFetchRequest(msgId, data.opts),
            fetchSocketsResponse: () => this._handleFetchResponse(msgId, data.sockets),
        }

        const handler = methods[type]

        // Викликаємо обробник, якщо такий тип команди існує
        if (handler) {
            handler(data, msgId)
        }
    }

    /**
     * Оптимізована трансляція: відправляємо пакет локально + публікуємо в Redis для інших нод.
     *
     * @override
     * @param {any} packet - Дані для відправки.
     * @param {import('./InMemoryAdapter.js').BroadcastOptions} [opts={}]
     */
    broadcast(packet, opts = {}) {
        // 1. Спочатку розсилаємо сокетам, які підключені безпосередньо до цієї ноди
        super.broadcast(packet, opts)

        // 2. Публікуємо в Redis, щоб інші ноди кластера зробили те саме для своїх сокетів
        const message = JSON.stringify({
            type: 'broadcast',
            origin: this.uid,
            data: { packet, opts },
        })
        this.pubClient.publish(this.channel, message)
    }

    /**
     * Оптимізований socketsJoin: замість завантаження об'єктів, даємо команду всім нодам кластера.
     *
     * @override
     * @param {Object} opts
     * @param {string|string[]} rooms
     */
    async socketsJoin(opts, rooms) {
        // Виконуємо локально
        super.socketsJoin(opts, rooms)

        // Відправляємо наказ усім іншим серверам виконати це локально у себе
        this.pubClient.publish(
            this.channel,
            JSON.stringify({
                type: 'socketsJoin',
                origin: this.uid,
                data: { opts, rooms },
            }),
        )
    }

    /**
     * Оптимізований socketsLeave через Redis.
     * @override
     */
    async socketsLeave(opts, rooms) {
        super.socketsLeave(opts, rooms)

        this.pubClient.publish(
            this.channel,
            JSON.stringify({
                type: 'socketsLeave',
                origin: this.uid,
                data: { opts, rooms },
            }),
        )
    }

    /**
     * Оптимізоване відключення сокетів через Redis.
     * @override
     */
    async disconnectSockets(opts, close = false) {
        super.disconnectSockets(opts, close)

        this.pubClient.publish(
            this.channel,
            JSON.stringify({
                type: 'disconnectSockets',
                origin: this.uid,
                data: { opts, close },
            }),
        )
    }

    /**
     * Збір інформації про сокети з усіх нод кластера.
     * Оскільки об'єкти сокетів містять TCP-з'єднання та функції (наприклад, sendRaw),
     * через мережу ми можемо передати лише їхні метадані (id, handshake, rooms тощо).
     *
     * @override
     * @param {Object} opts
     * @returns {Promise<Array<Object>>} Серіалізовані дані сокетів
     */
    async fetchSockets(opts = {}) {
        // Збираємо сокети з поточної ноди
        const localSockets = await super.fetchSockets(opts)
        const cleanLocal = localSockets.map((s) => ({
            id: s.id,
            handshake: s.handshake || {},
            rooms: Array.from(this.sids.get(s.id) || []),
        }))

        const msgId = Math.random().toString(36).substring(2, 15)

        // Публікуємо запит в кластер
        this.pubClient.publish(
            this.channel,
            JSON.stringify({
                type: 'fetchSocketsRequest',
                origin: this.uid,
                msgId,
                data: { opts },
            }),
        )

        // Очікуємо відповіді від інших нод протягом тайм-ауту (наприклад, 1000мс)
        return new Promise((resolve) => {
            const responses = [...cleanLocal]

            const timeout = setTimeout(() => {
                this._requests.delete(msgId)
                resolve(responses) // повертаємо все, що встигли зібрати
            }, 1000)

            this._requests.set(msgId, {
                responses,
                timeout,
                resolve,
            })
        })
    }

    /**
     * Обробка запиту на збір сокетів від чужої ноди.
     * @private
     */
    async _handleFetchRequest(msgId, opts) {
        const localSockets = await super.fetchSockets(opts)
        const serializedSockets = localSockets.map((s) => ({
            id: s.id,
            handshake: s.handshake || {},
            rooms: Array.from(this.sids.get(s.id) || []),
        }))

        this.pubClient.publish(
            this.channel,
            JSON.stringify({
                type: 'fetchSocketsResponse',
                origin: this.uid,
                msgId,
                data: { sockets: serializedSockets },
            }),
        )
    }

    /**
     * Накопичення відповідей від інших нод.
     * @private
     */
    _handleFetchResponse(msgId, remoteSockets) {
        const request = this._requests.get(msgId)
        if (!request) return

        // Додаємо знайдені сокети до загального масиву промісу
        request.responses.push(...remoteSockets)

        // Примітка: Оскільки ми не знаємо точної кількості нод у кластері,
        // зазвичай збір триває повний тайм-аут (1 секунду), після чого проміс резолвиться.
    }
}
