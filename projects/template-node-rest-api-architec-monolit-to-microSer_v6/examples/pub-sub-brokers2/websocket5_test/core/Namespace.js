import { Room } from './Room.js'

/**
 * Namespace: Абстрактний клас для логічної ізоляції з підтримкою DI та Cluster Sync.
 */
export class Namespace {
    /**
     * @param {object} params
     * @param {string} params.name
     * @param {string} params.serverId
     * @param {import('../interfaces/IStateAdapter').IStateAdapter} params.state
     * @param {import('../interfaces/IBrokerAdapter').IBrokerAdapter} params.broker
     * @param {import('../interfaces/ILogger').ILogger} params.logger
     */
    constructor({ name, serverId, state, broker, logger }) {
        this.name = name
        this.serverId = serverId
        this.state = state
        this.broker = broker
        this.logger = logger
        this.connections = new Map() // socketId -> Connection
        this.roomsMap = new Map()

        this.nsTopic = `ns_global:${this.name}`
        this._unsubNS = null
        this._init()
    }

    /** @private */
    _localNamespaceEmit(event, data) {
        this.connections.forEach((conn) => conn.send({ event, data }))
    }

    /** */
    async _init() {
        // Підписка на глобальні повідомлення неймспейсу (через весь кластер)
        this._unsubNS = await this.broker.subscribe(this.nsTopic, (packet) => {
            if (packet.origin === this.serverId) {
                return
            }
            this._localNamespaceEmit(packet.event, packet.data)
        })
    }

    /**
     * @param {string} roomName
     * @returns {Room}
     */
    room(roomName) {
        if (!this.roomsMap.has(roomName)) {
            this.roomsMap.set(roomName, new Room(roomName, this))
        }
        return this.roomsMap.get(roomName)
    }

    /**
     * Надіслати всім у цьому неймспейсі (у всьому кластері)
     * @param event
     * @param data
     */
    async broadcast(event, data) {
        await this.broker.publish(this.nsTopic, { event, data, origin: this.serverId })
        this._localNamespaceEmit(event, data)
    }

    /** Опорний метод: перевизначити для логіки аутентифікації */
    async authenticate(req) {
        return null
    }

    /** Опорний метод: перевизначити для логіки обробки вхідних даних */
    async onMessage(connection, rawData) {
        this.logger?.debug(`Raw message in ${this.name}: ${rawData}`)
    }

    async destroy() {
        this.logger?.info(`Destroying Namespace: ${this.name}`)

        // 1. Відписка від глобального каналу неймспейсу
        if (this._unsubNS) await this._unsubNS()

        // 2. Знищення всіх кімнат (кожна сама відпишеться)
        for (const room of this.roomsMap.values()) {
            await room.destroy()
        }

        // 3. Закриття сокетів
        this.connections.forEach((conn) => conn.ws.close(1001, 'NS_DESTROYED'))
        this.connections.clear()
    }

    // /**
    //  * @param {string} roomName
    //  * @param {any} payload
    //  * @param {string} [exceptId]
    //  */
    // async broadcast(roomName, payload, exceptId = null) {
    //     await this.broker.publish(`cluster:sync:${this.name}`, {
    //         room: roomName,
    //         payload,
    //         exceptId,
    //     })
    //     await this._localBroadcast(roomName, payload, exceptId)
    // }

    // /** @internal */
    // async _localBroadcast(roomName, payload, exceptId) {
    //     const ids = await this.state.getClientsInRoom(this.name, roomName)
    //     ids.forEach((id) => {
    //         if (id !== exceptId && this.connections.has(id)) {
    //             this.connections.get(id).send(payload)
    //         }
    //     })
    // }

    // /**
    //  * Повне очищення неймспейсу та відписка від брокера
    //  */
    // async destroy() {
    //     this.logger.info(`Destroying namespace ${this.name}`)

    //     // Отримуємо функцію відписки та викликаємо її
    //     const unsubscribe = await this._unsubPromise
    //     if (typeof unsubscribe === 'function') {
    //         await unsubscribe()
    //     }

    //     // Закриваємо всі локальні з'єднання
    //     for (const conn of this.connections.values()) {
    //         conn.ws.close(1001, 'Namespace closed')
    //     }

    //     this.connections.clear()
    //     this.roomsMap.clear()
    // }
}
