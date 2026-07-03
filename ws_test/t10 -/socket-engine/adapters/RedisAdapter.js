import { InMemoryAdapter } from './InMemoryAdapter.js'

/**
 * Асихронний масштабований RedisAdapter.
 * Реалізує міжсерверну комунікацію для кластерів Node.js через Redis Pub/Sub.
 * Надійно зберігає стан у Redis (Set), підтримує безпечний SCAN для High-Load,
 * а також крос-серверні команди disconnect та serverSideEmit.
 */
export class RedisAdapter extends InMemoryAdapter {
    /**
     * @param {object} nsp - Простір імен.
     * @param {object} pubClient - Екземпляр ioredis для публікації (Publish).
     * @param {object} subClient - Екземпляр ioredis для підписки (Subscribe).
     * @param {object} [options={}] - Додаткові опції адаптера.
     * @param {string} [options.key='ws'] - Префікс для каналів Redis.
     * @param {number} [options.requestsTimeout=5000] - Таймаут очікування відповідей від інших серверів кластера (мс).
     *  @param {number} [options.socketTtl=30] - Час життя сокета в Redis у секундах (захист від аварійного падіння сервера).
     */
    constructor(nsp, pubClient, subClient, options = {}) {
        super(nsp)

        this.pubClient = pubClient
        this.subClient = subClient

        const prefix = options.key ?? 'ws'
        const nspName = nsp.name || '/'

        // Канали зв'язку для кластера
        this.channelKey = `${prefix}#${nspName}#`
        this.requestChannelKey = `${prefix}#${nspName}#req#`
        this.responseChannelKey = `${prefix}#${nspName}#res#`

        this.interServerChannelKey = `${prefix}#${nspName}#inter-server#` // Канал для міжсерверних команд
        this.redisRoomsPrefix = `${prefix}#${nspName}#room#` // Префікс для room -> sids
        this.redisSidsPrefix = `${prefix}#${nspName}#sid#` // Префікс для sid -> rooms

        this.uid = Math.random().toString(36).substring(2, 15) // Унікальний ID поточного Node-сервера
        this.requestsTimeout = options.requestsTimeout ?? 5000
        this.socketTtl = options.socketTtl ?? 30 // TTL 30 секунд за замовчуванням

        // Мапа для очікування відповідей на крос-серверні запити (fetchSockets)
        this.requests = new Map()

        // Інтервал для оновлення TTL живих сокетів (Heartbeat)
        this.heartbeatInterval = null

        this.isRedisReady = false // Прапорець доступності бази

        // Налаштовуємо слухачі подій для клієнта команд
        this._setupPubClientListeners()

        // Первинне налаштування підписки Pub/Sub
        this._setupRedisSubscription().catch((err) => {
            if (typeof this.nsp._handleError === 'function') {
                this.nsp._handleError('redis_init', err)
            }
        })

        // Запуск періодичного оновлення TTL
        this._startHeartbeat()
    }

    /**
     * Відслідковує стан підключення pubClient для увімкнення Fallback-режиму
     * та ініціалізації повторної синхронізації (Re-sync).
     * @private
     */
    _setupPubClientListeners() {
        if (!this.pubClient) return

        // Якщо Redis успішно підключився або відновив зв'язок
        const onReady = () => {
            this.isRedisReady = true
            this._syncLocalStateToRedis().catch((err) => {
                this._handleError('redis_resync_failed', err)
            })
        }

        this.pubClient.on('ready', onReady)
        this.pubClient.on('connect', () => {
            this.isRedisReady = true
        })

        // Якщо зв'язок з Redis втрачено
        this.pubClient.on('close', () => {
            this.isRedisReady = false
            this._handleError(
                'redis_disconnected',
                new Error('Connection to Redis lost. Switched to InMemory Fallback.'),
            )
        })
    }

    /**
     * Налаштовує підписку на системні канали Redis.
     * Викликається також автоматично при відновленні зв'язку (resubscribe).
     * @private
     */
    async _setupRedisSubscription() {
        if (!this.subClient || typeof this.subClient.subscribe !== 'function') return

        // Одночасно підписуємось на бродкаст, канали запитів та відповідей
        const setup = async () => {
            await this.subClient.subscribe([
                this.channelKey,
                this.requestChannelKey,
                this.responseChannelKey,
                this.interServerChannelKey,
            ])
        }

        // Вішаємо слухач події відновлення підписок
        this.subClient.off('ready', setup)
        this.subClient.on('ready', setup)

        // Викликаємо підписку прямо зараз для першого старту
        await setup()

        // Очищуємо старі слухачі повідомлень, щоб не було дублювання подій
        this.subClient.removeAllListeners('message')

        this.subClient.on('message', (channel, message) => {
            try {
                // 1. ОБРОБКА БРОДКАСТУ (ПУБЛІКАЦІЯ ПАКЕТІВ З ІНШИХ НОД)
                if (channel === this.channelKey) {
                    const { uid, packet, opts } = JSON.parse(message)

                    // ЗАХИСТ: якщо повідомлення прийшло від нас самих — ігноруємо,
                    // ми його вже локально відправили в методі broadcast()
                    if (uid === this.uid) return

                    // Відновлюємо структури Set після JSON-серіалізації
                    const restoredOpts = {
                        rooms: new Set(opts.rooms),
                        except: new Set(opts.except),
                        flags: opts.flags,
                    }

                    // Викликаємо локальний бродкаст InMemoryAdapter для сокетів, які висять на цьому інстансі
                    super.broadcast(packet, restoredOpts)
                    return
                }

                // 2. ОБРОБКА МІЖСЕРВЕРНИХ ЗАПИТІВ (Хтось у кластері шукає сокети)
                if (channel === this.requestChannelKey) {
                    const { reqId, uid, type, opts } = JSON.parse(message)

                    // ЗАХИСТ: якщо повідомлення прийшло від нас самих — ігноруємо
                    if (uid === this.uid) return

                    if (type === 'fetchSockets') {
                        super.fetchSockets(opts).then((localSockets) => {
                            // Серіалізуємо сокети (передаємо лише базові дані, бо екземпляри класів не передати по мережі)
                            const data = localSockets.map((s) => ({
                                id: s.id,
                                handshake: s.handshake,
                                rooms:
                                    s.rooms instanceof Set
                                        ? [...s.rooms]
                                        : Array.isArray(s.rooms)
                                          ? s.rooms
                                          : [],
                            }))

                            this.pubClient
                                .publish(
                                    this.responseChannelKey,
                                    JSON.stringify({
                                        reqId,
                                        uid: this.uid,
                                        data,
                                    }),
                                )
                                .catch(() => {})
                        })
                    } else if (type === 'getRoomsBySocket') {
                        // ОБРОБКА ЗАПИТУ КІМНАТ СОКЕТА
                        // Викликаємо локальний InMemoryAdapter
                        super.getRoomsBySocket(socketId).then((localRoomsSet) => {
                            // Якщо сокет знайдено локально і він має кімнати
                            if (localRoomsSet && localRoomsSet.size > 0) {
                                this.pubClient
                                    .publish(
                                        this.responseChannelKey,
                                        JSON.stringify({
                                            reqId,
                                            uid: this.uid,
                                            data: [...localRoomsSet], // Перетворюємо Set в масив для JSON
                                        }),
                                    )
                                    .catch(() => {})
                            }
                        })
                    }
                    return
                }

                // 3. ОБРОБКА ВІДПОВІДЕЙ НА НАШІ Ж ЗАПИТИ
                if (channel === this.responseChannelKey) {
                    const { reqId, uid, data } = JSON.parse(message)

                    // ЗАХИСТ: якщо повідомлення прийшло від нас самих — ігноруємо,
                    if (uid === this.uid) return

                    const request = this.requests.get(reqId)
                    if (request) {
                        request.responses.push(...data)
                    }
                    return
                }

                // 4. ОБРОБКА МІЖСЕРВЕРНИХ КОМАНД (DISCONNECT ТА SERVERSIDEEMIT)
                if (channel === this.interServerChannelKey) {
                    const { uid, type, data } = JSON.parse(message)
                    if (uid === this.uid) return // Ігноруємо свої ж команди

                    // Дистанційне відключення сокета
                    if (type === 'remoteDisconnect') {
                        const { socketId, close } = data
                        const socket = this.nsp.sockets?.get(socketId)
                        if (socket && typeof socket.disconnect === 'function') {
                            socket.disconnect(close) // Кікаємо сокет локально, якщо він на цьому сервері
                        }
                    }

                    // Міжсерверний івент (наприклад, для синхронізації внутрішнього стану нод)
                    if (type === 'serverSideEmit') {
                        const { event, args } = data
                        if (typeof this.nsp.onServerSideEmit === 'function') {
                            this.nsp.onServerSideEmit(event, args)
                        }
                    }
                    return
                }
            } catch (error) {
                if (typeof this.nsp._handleError === 'function') {
                    this.nsp._handleError('redis_message_parse', error)
                }
            }
        })
    }

    /**
     * Після відновлення мережі повністю вивантажує локальний стан сервера в Redis.
     * @private
     */
    async _syncLocalStateToRedis() {
        if (!this.pubClient || this.sids.size === 0) return

        const pipeline = this.pubClient.pipeline()

        for (const [socketId, roomsSet] of this.sids.entries()) {
            const sidKey = `${this.redisSidsPrefix}${socketId}`

            for (const roomName of roomsSet) {
                pipeline.sadd(`${this.redisRoomsPrefix}${roomName}`, socketId)
                pipeline.sadd(sidKey, roomName)
            }
            pipeline.expire(sidKey, this.socketTtl)
        }

        await pipeline.exec().catch((err) => {
            this._handleError('redis_resync_pipeline_failed', err)
        })
    }

    /**
     * Запускає періодичне оновлення TTL для сокетів, які зараз підключені до цієї ноди.
     * Запобігає видаленню активних сокетів з бази Redis.
     * @private
     */
    _startHeartbeat() {
        this.heartbeatInterval = setInterval(
            () => {
                // Оновлюємо TTL в базі тільки якщо Redis доступний і в пам'яті є сокети
                if (!this.isRedisReady || !this.pubClient || this.sids.size === 0) return

                const pipeline = this.pubClient.pipeline()

                // Проходимо по всіх локальних сокетах у пам'яті
                for (const socketId of this.sids.keys()) {
                    const sidKey = `${this.redisSidsPrefix}${socketId}`
                    pipeline.expire(sidKey, this.socketTtl)
                }

                pipeline.exec().catch((err) => {
                    this._handleError('redis_heartbeat_failed', err)
                })
            },
            Math.max(2000, (this.socketTtl * 1000) / 3),
        ) // Оновлюємо кожну 1/3 частину від TTL
    }

    /**
     * Додає сокет до конкретної кімнати з дублюванням у Redis.
     * @override
     */
    async add(socketId, roomName) {
        if (!socketId || typeof socketId !== 'string' || !roomName || typeof roomName !== 'string')
            return

        // 1. Спочатку оновлюємо локальну пам'ять (швидко)
        await super.add(socketId, roomName)

        // 2. Записуємо в Redis
        if (this.isRedisReady && this.pubClient) {
            const roomKey = `${this.redisRoomsPrefix}${roomName}`
            const sidKey = `${this.redisSidsPrefix}${socketId}`

            const pipeline = this.pubClient.pipeline()
            pipeline.sadd(roomKey, socketId)
            pipeline.sadd(sidKey, roomName)
            pipeline.expire(sidKey, this.socketTtl) // Виставляємо TTL на сокет

            await pipeline.exec().catch((err) => this._handleError('redis_add_failed', err))
        }
    }

    /**
     * Додає сокет до кількох кімнат одночасно через Pipeline (High-Load Оптимізація).
     * @override
     */
    async addAll(socketId, rooms) {
        if (typeof socketId !== 'string' || !socketId || !rooms) return

        const roomsList = rooms instanceof Set ? [...rooms] : rooms
        if (!Array.isArray(roomsList) || roomsList.length === 0) return

        // 1. Оновлюємо локальну пам'ять
        const len = roomsList.length
        for (let i = 0; i < len; i++) {
            await super.add(socketId, roomsList[i])
        }

        // 2. Зливаємо всі запити в один Pipeline до Redis (один мережевий запит замість сотні)
        if (this.isRedisReady && this.pubClient) {
            const pipeline = this.pubClient.pipeline()
            const sidKey = `${this.redisSidsPrefix}${socketId}`

            for (let i = 0; i < len; i++) {
                const roomName = roomsList[i]
                if (typeof roomName === 'string' && roomName) {
                    pipeline.sadd(`${this.redisRoomsPrefix}${roomName}`, socketId)
                    pipeline.sadd(sidKey, roomName)
                }
            }
            pipeline.expire(sidKey, this.socketTtl)

            await pipeline.exec().catch((err) => this._handleError('redis_add_all_failed', err))
        }
    }

    /**
     * Видаляє сокет з конкретної кімнати в пам'яті та в Redis.
     * @override
     */
    async del(socketId, roomName) {
        if (!socketId || typeof socketId !== 'string' || !roomName || typeof roomName !== 'string')
            return

        // 1. Видаляємо локально
        await super.del(socketId, roomName)

        // 2. Видаляємо з Redis
        if (this.isRedisReady && this.pubClient) {
            const roomKey = `${this.redisRoomsPrefix}${roomName}`
            const sidKey = `${this.redisSidsPrefix}${socketId}`

            const pipeline = this.pubClient.pipeline()
            pipeline.srem(roomKey, socketId)
            pipeline.srem(sidKey, roomName)

            await pipeline.exec().catch((err) => this._handleError('redis_del_failed', err))
        }
    }

    /**
     * Повністю видаляє сокет з усіх кімнат (при штатному дисконекті).
     * @override
     */
    async delAll(socketId) {
        if (typeof socketId !== 'string' || !socketId) return

        const roomsSet = this.sids.get(socketId)

        // 1. Очищуємо пам'ять поточного сервера
        await super.delAll(socketId)

        // 2. Видаляємо сокет з усіх кімнат у Redis
        if (this.isRedisReady && this.pubClient && roomsSet && roomsSet.size > 0) {
            const pipeline = this.pubClient.pipeline()
            const sidKey = `${this.redisSidsPrefix}${socketId}`

            for (const roomName of roomsSet) {
                pipeline.srem(`${this.redisRoomsPrefix}${roomName}`, socketId)
            }
            pipeline.del(sidKey) // Видаляємо сам індекс сокета

            await pipeline.exec().catch((err) => this._handleError('redis_del_all_failed', err))
        }
    }

    /**
     * Публікує пакет у Redis для розсилки по всьому кластеру серверів,
     * та одночасно виконує миттєву локальну відправку.
     * @override
     */
    async broadcast(packet, opts) {
        if (!packet || !opts) return

        // 1. Спочатку робимо моментальну відправку для сокетів на цьому ж сервері
        await super.broadcast(packet, opts)

        const flags = opts.flags || {}

        // НЮАНС SOCKET.IO: якщо виставлено прапорець .local,
        // повідомлення заборонено слати в Redis, воно лишається тільки тут
        if (flags.local) return

        // 2. Публікуємо в Redis для інших серверів кластера
        if (this.isRedisReady && this.pubClient && typeof this.pubClient.publish === 'function') {
            const message = JSON.stringify({
                uid: this.uid,
                packet,
                opts: {
                    rooms: opts.rooms ? [...opts.rooms] : [], // JSON не вміє в Set, перетворюємо в масиви
                    except: opts.except ? [...opts.except] : [],
                    flags: flags,
                },
            })

            await this.pubClient.publish(this.channelKey, message)
        }
    }

    // /**
    //  * Повертає список кімнат, у яких перебуває сокет, шукаючи по всьому кластеру.
    //  * @override
    //  * @param {string} socketId - ID сокета.
    //  * @returns {Promise<Set<string>>} Сет назв кімнат.
    //  */
    // async getRoomsBySocket(socketId) {
    //     if (typeof socketId !== 'string' || !socketId) return new Set()

    //     // 1. Спочатку перевіряємо, чи немає цього сокета на поточному інстансі
    //     const localRooms = await super.getRoomsBySocket(socketId)
    //     if (localRooms.size > 0) {
    //         return localRooms
    //     }

    //     // 2. Якщо локально сокета немає, опитуємо весь кластер через Redis
    //     if (!this.pubClient || !this.subClient) {
    //         return new Set()
    //     }

    //     const reqId = Math.random().toString(36).substring(2, 15)

    //     return new Promise((resolve) => {
    //         const requestContext = {
    //             responses: [],
    //             resolve,
    //             timeout: setTimeout(() => {
    //                 this.requests.delete(reqId)

    //                 // Оскільки сокет може бути лише на одній ноді,
    //                 // у responses прилетить максимум один масив кімнат
    //                 resolve(new Set(requestContext.responses))
    //             }, this.requestsTimeout),
    //         }

    //         this.requests.set(reqId, requestContext)

    //         const message = JSON.stringify({
    //             reqId,
    //             uid: this.uid,
    //             type: 'getRoomsBySocket',
    //             socketId,
    //         })

    //         this.pubClient.publish(this.requestChannelKey, message).catch((err) => {
    //             clearTimeout(requestContext.timeout)
    //             this.requests.delete(reqId)
    //             resolve(new Set())
    //         })
    //     })
    // }

    /**
     * ПОВНІСТЮ ОВЕРРАЙД: Повертає список кімнат сокета ПРЯМО з Redis.
     * Працює БЕЗ Pub/Sub. Поверне дані, навіть якщо сервер, де сидів сокет, впав.
     * @override
     */
    async getRoomsBySocket(socketId) {
        if (typeof socketId !== 'string' || !socketId) return new Set()

        // Крок 1. Спочатку швидка перевірка у власній оперативній пам'яті
        const localRooms = await super.getRoomsBySocket(socketId)
        if (localRooms.size > 0) {
            return localRooms
        }

        // Крок 2. Якщо локально сокета немає, робимо миттєвий запит в Redis (минувши Pub/Sub)
        if (this.isRedisReady && this.pubClient) {
            const sidKey = `${this.redisSidsPrefix}${socketId}`
            const roomsArray = await this.pubClient.smembers(sidKey).catch(() => [])
            return new Set(roomsArray)
        }

        return new Set()
    }

    // /**
    //  * Збирає сокети по всьому Redis-кластеру (локальні + віддалені з інших нод).
    //  * @override
    //  * @param {object} [opts={}] - Опції фільтрації (наприклад, { room: 'lobby' })
    //  * @returns {Promise<object[]>} Масив сокетів (локальні сокети + POJO-проксі віддалених сокетів).
    //  */
    // async fetchSockets(opts = {}) {
    //     // 1. Спочатку збираємо сокети, підключені безпосередньо до цієї Ноди
    //     const localSockets = await super.fetchSockets(opts)

    //     // Якщо клієнти Redis відсутні — повертаємо локальну вибірку
    //     if (!this.pubClient || !this.subClient) {
    //         return localSockets
    //     }

    //     const reqId = Math.random().toString(36).substring(2, 15)

    //     return new Promise((resolve) => {
    //         const requestContext = {
    //             responses: [],
    //             resolve,
    //             timeout: setTimeout(() => {
    //                 this.requests.delete(reqId)

    //                 // Зливаємо локальні інстанси та серіалізовані дані з інших серверів кластера
    //                 const allSockets = [...localSockets, ...requestContext.responses]
    //                 resolve(allSockets)
    //             }, this.requestsTimeout),
    //         }

    //         this.requests.set(reqId, requestContext)

    //         const message = JSON.stringify({
    //             reqId,
    //             uid: this.uid,
    //             type: 'fetchSockets',
    //             opts,
    //         })

    //         this.pubClient.publish(this.requestChannelKey, message).catch((err) => {
    //             clearTimeout(requestContext.timeout)
    //             this.requests.delete(reqId)
    //             resolve(localSockets) // При збої публікації віддаємо хоча б локальні
    //         })
    //     })
    // }

    /**
     * Збирає сокети по всьому Redis-кластеру (локальні + віддалені).
     * Дані беруться прямо з бази Redis, що гарантує стійкість при перезавантаженні нод.
     * @override
     * @param {object} [opts={}] - Опції фільтрації (наприклад, { room: 'lobby' }).
     * @returns {Promise<object[]>} Масив сокетів (локальні інстанси + POJO-об'єкти віддалених сокетів).
     */
    async fetchSockets(opts = {}) {
        // 1. Спочатку беремо живі локальні сокети з пам'яті цього сервера
        const localSockets = await super.fetchSockets(opts)

        // Якщо клієнт Redis не підключений, повертаємо те, що є локально
        if (!this.isRedisReady || !this.pubClient) {
            return localSockets
        }

        let allSocketIds = []

        try {
            if (opts && typeof opts.room === 'string' && opts.room) {
                // Сценарій А: Запитуємо ID сокетів конкретної кімнати з Redis
                const roomKey = `${this.redisRoomsPrefix}${opts.room}`
                allSocketIds = await this.pubClient.smembers(roomKey)
            } else {
                // Сценарій Б: Фільтр порожній, потрібно отримати взагалі всі сокети кластера.
                // УВАГА: Для High-Load під загрозою мільйонів коннектів команда KEYS / SMEMBERS
                // на глобальні списки може заблокувати Redis.
                // Тому ми збираємо сокети через SCAN за префіксом sid#.
                const matchPattern = `${this.redisSidsPrefix}*`
                let cursor = '0'
                const keys = []

                do {
                    const reply = await this.pubClient.scan(
                        cursor,
                        'MATCH',
                        matchPattern,
                        'COUNT',
                        1000,
                    )
                    cursor = reply[0]
                    keys.push(...reply[1])
                } while (cursor !== '0')

                // Вирізаємо префікс, щоб залишилися чисті socketId
                const prefixLen = this.redisSidsPrefix.length
                allSocketIds = keys.map((key) => key.substring(prefixLen))
            }
        } catch (err) {
            this._handleError('redis_fetch_sockets_failed', err)
            return localSockets // У разі збою віддаємо локальні, щоб не ламати логіку програми
        }

        if (allSocketIds.length === 0) {
            return []
        }

        // 2. Будуємо фінальний список сокетів
        const result = []
        const localSocketsMap = new Map(localSockets.map((s) => [s.id, s]))

        for (let i = 0; i < allSocketIds.length; i++) {
            const id = allSocketIds[i]

            // Якщо сокет підключений до ЦЬОГО сервера, додаємо його повноцінний живий об'єкт
            if (localSocketsMap.has(id)) {
                result.push(localSocketsMap.get(id))
            } else {
                // Якщо сокет віддалений (на іншому сервері), створюємо для нього POJO-проксі об'єкт з базовими метаданими.
                // Оскільки самого об'єкта Socket з методами (.emit, .disconnect) з іншого сервера у нас в пам'яті немає.
                result.push({
                    id: id,
                    handshake: {}, // Можна додати вибірку handshake з Redis, якщо ви зберігаєте його окремо
                    rooms: [], // Кімнати за потреби можна дізнатися через getRoomsBySocket(id)
                })
            }
        }

        return result
    }

    /**
     * Дистанційно відключає сокет на будь-якому сервері кластера.
     * @param {string} socketId - ID сокета, який треба відключити.
     * @param {boolean} [close=false] - Чи закривати базове з'єднання під куполом.
     */
    async remoteDisconnect(socketId, close = false) {
        if (typeof socketId !== 'string' || !socketId) return

        // 1. Якщо сокет сидить на цьому ж сервері — відключаємо моментально
        const localSocket = this.nsp.sockets?.get(socketId)
        if (localSocket) {
            localSocket.disconnect(close)
        }

        // 2. Публікуємо команду відключення в міжсерверний канал Redis для інших нод
        if (this.isRedisReady && this.pubClient) {
            const message = JSON.stringify({
                uid: this.uid,
                type: 'remoteDisconnect',
                data: { socketId, close },
            })
            await this.pubClient.publish(this.interServerChannelKey, message).catch(() => {})
        }
    }

    /**
     * Надсилає кастомну подію від одного Node-сервера до всіх інших нод кластера.
     * @param {string} event - Назва системної події.
     * @param {any} args - Дані події.
     */
    async serverSideEmit(event, args) {
        if (typeof event !== 'string' || !event) return

        if (this.isRedisReady && this.pubClient) {
            const message = JSON.stringify({
                uid: this.uid,
                type: 'serverSideEmit',
                data: { event, args },
            })
            await this.pubClient.publish(this.interServerChannelKey, message).catch(() => {})
        }
    }

    /**
     * Повне очищення підписок при знищенні адаптера / закритті namespace.
     * Запобігає витоку пам'яті (Memory Leak).
     */
    async close() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval)
        }

        if (this.subClient && typeof this.subClient.unsubscribe === 'function') {
            await this.subClient.unsubscribe([
                this.channelKey,
                this.requestChannelKey,
                this.responseChannelKey,
                this.interServerChannelKey,
            ])
        }

        for (const request of this.requests.values()) {
            clearTimeout(request.timeout)
        }

        this.requests.clear()
    }
}
