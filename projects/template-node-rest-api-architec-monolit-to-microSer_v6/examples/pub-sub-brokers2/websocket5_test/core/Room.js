/**
 * Сутність Room: забезпечує інтерфейс взаємодії з групою сокетів.
 */
export class Room {
    /**
     * @param {string} name
     * @param {import('./Namespace').Namespace} ns
     */
    constructor(name, ns) {
        this.name = name
        this.ns = ns
        this.topic = `room_sync:${this.ns.name}:${this.name}`
        /**
         * @type {Function|null}
         */
        this._unsubBroker = null
        /**
         * @type {number}
         */
        this.localConnectionsCount = 0
    }

    /**
     * Додає сокет до кімнати та створює підписку на брокер, якщо це перший клієнт.
     * @param {string} socketId
     */
    async join(socketId) {
        await this.ns.state.addUserToRoom(this.ns.name, this.name, socketId)
        this.localConnectionsCount++

        // Якщо це перший локальний клієнт у цій кімнаті — підписуємось на брокер
        if (this.localConnectionsCount === 1) {
            this.ns.logger?.debug(`Subscribing to broker topic: ${this.topic}`)
            this._unsubBroker = await this.ns.broker.subscribe(this.topic, (packet) => {
                if (packet.origin === this.ns.serverId) {
                    return
                }
                this._internalEmit(packet.event, packet.data, packet.exceptId)
            })
        }
    }

    /**
     * Видаляє сокет та відписується від брокера, якщо клієнтів більше немає.
     * @param {string} socketId
     */
    async leave(socketId) {
        await this.ns.state.removeUserFromRoom(this.ns.name, this.name, socketId)
        this.localConnectionsCount--

        // Якщо локальних клієнтів не залишилось — відписуємось від брокера
        if (this.localConnectionsCount === 0 && this._unsubBroker) {
            this.ns.logger?.debug(`Unsubscribing from broker topic: ${this.topic}`)
            await this._unsubBroker()
            this._unsubBroker = null
            // Видаляємо об'єкт кімнати з неймспейсу для очищення пам'яті
            this.ns.roomsMap.delete(this.name)
        }
    }

    /**
     * Надсилає повідомлення через брокер (всім інстансам) та локально.
     * @param {string} event
     * @param {any} data
     * @param {string} [exceptId]
     */
    async emit(event, data, exceptId = null) {
        // await this.ns.broadcast(this.name, { event, data }, exceptId)

        // 1. Публікація в брокер для інших серверів
        await this.ns.broker.publish(this.topic, {
            event,
            data,
            exceptId,
            origin: this.ns.serverId,
        })
        // 2. Локальна розсилка
        this._internalEmit(event, data, exceptId)
    }

    /**
     * Повне очищення ресурсів кімнати
     */
    async destroy() {
        if (this._unsubBroker) {
            await this._unsubBroker() // Зупиняємо підписку в Redis/Memory
            this._unsubBroker = null
            this.ns.logger?.debug(`[Room:${this.name}] Unsubscribed from broker`)
        }
        this.ns.roomsMap.delete(this.name) // Видаляємо себе з реєстру Namespace
    }

    /**
     * Локальна розсилка тільки клієнтам на цьому сервері.
     * @private
     */
    async _internalEmit(event, data, exceptId) {
        const ids = await this.ns.state.getClientsInRoom(this.ns.name, this.name)
        ids.forEach((id) => {
            if (id !== exceptId && this.ns.connections.has(id)) {
                this.ns.connections.get(id).send({ event, data })
            }
        })
    }
}
