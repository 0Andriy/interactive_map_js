import { Adapter } from './Adapter.js'
import crypto from 'crypto'

export class RedisAdapter extends Adapter {
    constructor(options) {
        super(options)

        // Клієнти Redis для публікації (pub) та підписки (sub)
        this.pubClient = options.pubClient
        this.subClient = options.subClient

        // Унікальний ID поточного сервера (наприклад, UUID або hostname)
        this.serverId = options.serverId

        // Префікс для уникнення конфліктів між різними проектами в одному Redis
        this.prefix = `ws:${this.nsp.name}:`

        // Канали зв'язку: загальний для запитів та персональний для відповідей цьому серверу
        this.rpcChannel = `${this.prefix}rpc:`
        this.responseChannel = `${this.prefix}resp:${this.serverId}:`

        // Сховище активних запитів: requestId -> { resolve, results, timeout, expectedResponses, ... }
        this.requests = new Map()

        this._init()
    }

    /**
     * Ініціалізація: реєстрація сервера та підписки
     */
    async _init() {
        // 1. Реєструємо поточний сервер у списку активних вузлів
        await this.pubClient.sAdd(`${this.prefix}active_servers`, this.serverId)

        // 2. Встановлюємо мітку "Я живий" з терміном дії 10 секунд
        // Якщо сервер впаде, мітка зникне сама через 10 сек.
        const updateHeartbeat = async () => {
            await this.pubClient.set(`${this.prefix}hb:${this.serverId}`, '1', 'EX', 10)
        }

        await updateHeartbeat()
        this.hbInterval = setInterval(updateHeartbeat, 5000) // Оновлюємо кожні 5 сек.

        // 3. Виписка при штатному вимкненні
        const cleanup = async () => {
            clearInterval(this.hbInterval)
            await this.pubClient.sRem(`${this.prefix}active_servers`, this.serverId)
            await this.pubClient.del(`${this.prefix}hb:${this.serverId}`)
            process.exit()
        }

        // Видаляємо себе зі списку при виході з програми
        process.on('SIGTERM', cleanup)
        process.on('SIGINT', cleanup)

        await this._setupSubscription()
    }

    async _setupSubscription() {
        // 1. Слухаємо повідомлення для конкретних кімнат (через патерн)
        await this.subClient.pSubscribe(`${this.prefix}room:*`, (message, channel) => {
            this._onBroadcast(message)
        })

        // 2. Слухаємо загальні повідомлення (наприклад, розсилка всім сокетам)
        await this.subClient.subscribe(`${this.prefix}all:`, (message) => {
            this._onBroadcast(message)
        })

        // 3. Слухаємо RPC-запити від інших серверів ("Хто має сокет X?")
        await this.subClient.subscribe(this.rpcChannel, (message) => {
            this._onRpcRequest(message)
        })

        // 4. Слухаємо відповіді на НАШІ запити, які прийшли від інших серверів
        await this.subClient.subscribe(this.responseChannel, (message) => {
            this._onRpcResponse(message)
        })
    }

    /** --- BROADCAST LOGIC --- **/

    broadcast(packet, opts = {}) {
        // Спочатку відправляємо клієнтам, що підключені безпосередньо до цього сервера
        super.broadcast(packet, opts)

        const rooms = opts.rooms || new Set()
        const payload = JSON.stringify({
            serverId: this.serverId,
            packet,
            opts: {
                ...opts,
                rooms: Array.from(rooms), // Set не серіалізується в JSON, тому перетворюємо в масив
                except: Array.from(opts.except || []),
            },
        })

        // Якщо вказані кімнати — шлемо в канали кімнат, інакше — в загальний канал
        if (rooms.size > 0) {
            for (const room of rooms) {
                this.pubClient.publish(`${this.prefix}room:${room}:`, payload)
            }
        } else {
            // Отправляем в общий канал неймспейса
            this.pubClient.publish(`${this.prefix}all:`, payload)
        }
    }

    _onBroadcast(message) {
        try {
            const { serverId, packet, opts } = JSON.parse(message)
            // Ігноруємо повідомлення, які ми самі ж і відправили в Redis
            if (serverId === this.serverId) return

            // Відновлюємо структури Set для базового класу Adapter
            const internalOpts = {
                ...opts,
                rooms: new Set(opts.rooms),
                except: new Set(opts.except),
            }

            super.broadcast(packet, internalOpts)
        } catch (e) {
            /* ignore */
        }
    }

    /** --- CLUSTER FETCH SOCKETS (RPC) --- **/

    /**
     * Отримуємо реальну кількість живих серверів (фільтрація тих, хто впав)
     */
    async _getAliveNodesCount() {
        const nodes = await this.pubClient.sMembers(`${this.prefix}active_servers`)
        const aliveNodes = []

        for (const node of nodes) {
            // Перевіряємо, чи є у вузла активна мітка heartbeat
            const exists = await this.pubClient.exists(`${this.prefix}hb:${node}`)
            if (exists) {
                aliveNodes.push(node)
            } else {
                // Якщо мітки немає — видаляємо "мертвий" вузол зі списку
                await this.pubClient.sRem(`${this.prefix}active_servers`, node)
            }
        }
        return aliveNodes.length
    }

    async fetchSockets(opts = {}) {
        // Крок 1: Знаходимо локальні сокети на цьому сервері
        const localSockets = super.fetchSockets(opts)

        // Крок 2: Отримуємо кількість активних серверів, щоб знати, скільки відповідей чекати
        const aliveCount = await this._getAliveNodesCount()
        const expectedResponses = aliveCount - 1 // мінус ми самі

        // Якщо ми єдиний сервер — повертаємо локальний результат негайно
        if (expectedResponses <= 0) return localSockets

        const requestId = crypto.randomUUID()

        const requestPayload = JSON.stringify({
            requestId,
            serverId: this.serverId,
            opts: {
                ...opts,
                rooms: opts.rooms ? Array.from(opts.rooms) : [],
                except: opts.except ? Array.from(opts.except) : [],
            },
        })

        const remoteSocketsPromise = new Promise((resolve) => {
            const results = []

            // Запобіжник: якщо якийсь сервер завис, повертаємо те, що встигли зібрати, через 1 сек.
            const timeout = setTimeout(() => {
                if (this.requests.has(requestId)) {
                    this.requests.delete(requestId)
                    // Повертаємо те, що встигли зібрати
                    resolve([...localSockets, ...results.flat()])
                }
            }, 2000)

            // Реєструємо запит у Map. Об'єкти передаються за посиланням,
            // тому _onRpcResponse зможе наповнювати масив results.
            this.requests.set(requestId, {
                resolve,
                results,
                timeout,
                expectedResponses,
                receivedCount: 0,
                localSockets,
            })
        })

        // Публікуємо запит для всіх інших серверів
        this.pubClient.publish(this.rpcChannel, requestPayload)

        const remoteResults = await remoteSocketsPromise
        return remoteResults
    }

    async _onRpcRequest(message) {
        try {
            const { requestId, serverId, opts } = JSON.parse(message)
            // Пропускаємо власні запити
            if (serverId === this.serverId) return

            // Шукаємо сокети локально на цьому сервері
            const sockets = super.fetchSockets({
                rooms: new Set(opts.rooms),
                except: new Set(opts.except),
            })

            const responsePayload = JSON.stringify({ requestId, sockets })

            // Надсилаємо відповідь ПРЯМО тому серверу, який запитував
            this.pubClient.publish(`${this.prefix}resp:${serverId}:`, responsePayload)
        } catch (e) {
            /* ignore */
        }
    }

    _onRpcResponse(message) {
        try {
            const { requestId, sockets } = JSON.parse(message)
            const request = this.requests.get(requestId)
            if (!request) return

            // Додаємо отримані сокети до списку результатів
            request.results.push(sockets)
            request.receivedCount++

            // Якщо ми отримали відповіді від усіх серверів — завершуємо Promise негайно!
            if (request.receivedCount >= request.expectedResponses) {
                clearTimeout(request.timeout) // Скасовуємо таймер
                this.requests.delete(requestId) // Очищаємо пам'ять
                request.resolve([...request.localSockets, ...request.results.flat()])
            }
        } catch (e) {
            /* ignore */
        }
    }
}
