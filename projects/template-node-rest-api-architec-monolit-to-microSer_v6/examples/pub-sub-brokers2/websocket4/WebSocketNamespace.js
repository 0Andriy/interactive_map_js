/**
 * @file Клас для управління простором імен WebSocket (набором кімнат).
 */

import WebSocketRoom from './WebSocketRoom.js'

/**
 * Керує набором кімнат у певному просторі імен (наприклад, 'chat', 'game').
 * Відповідає за маршрутизацію повідомлень до відповідних з'єднань та масштабування через Pub/Sub.
 */
class WebSocketNamespace {
    /**
     * @type {string} Назва простору імен (наприклад, 'chat').
     */
    name

    /**
     * @private
     * @type {Map<string, WebSocketRoom>} Зберігає кімнати по назві.
     */
    #rooms = new Map()

    /**
     * @private
     * @type {Map<string, WebSocketConnection>} Посилання на всі активні з'єднання в системі.
     */
    #allConnections

    /**
     * @private
     * @type {object | null} Приватний логер.
     */
    #logger

    /**
     * @private
     * @type {object | null} Брокер повідомлень (наприклад, Redis клієнт з методами publish/subscribe).
     */
    #pubSubBroker

    /**
     * @type {Function | null} Зовнішній обробник повідомлень, що надходять від клієнтів.
     */
    onMessage = null

    /**
     * Створює екземпляр WebSocketNamespace.
     * @param {string} name - Назва простору імен.
     * @param {Map<string, WebSocketConnection>} allConnections - Глобальна мапа активних з'єднань.
     * @param {object} [logger=null] - Опціональний об'єкт логера.
     * @param {object} [pubSubBroker=null] - Опціональний брокер повідомлень (для горизонтального масштабування).
     */
    constructor(name, allConnections, logger = null, pubSubBroker = null) {
        this.name = name
        this.#allConnections = allConnections
        this.#logger = logger
        this.#pubSubBroker = pubSubBroker

        this.#logger?.debug(`Namespace ${this.name} initialized.`)

        if (this.#pubSubBroker) {
            const channel = `ws:${this.name}`
            // Підписуємося на канал і прив'язуємо обробник
            this.#pubSubBroker.subscribe(channel, this.#handleBrokerMessage)
            this.#logger?.info(`Підписано до PubSub каналу: ${channel}`)
        }
    }

    /**
     * Приватний метод для обробки повідомлень, що надійшли від брокера PubSub (від інших інстансів сервера).
     * @private
     * @param {string} message - JSON-рядок повідомлення від брокера.
     */
    #handleBrokerMessage = (message) => {
        try {
            // Формат: { roomName: 'general', payload: { type: 'NEW_MESSAGE', ... }, excludeId: 'uuid-відправника' }
            const data = JSON.parse(message)

            this.#logger?.debug(`Отримано повідомлення від брокера для кімнати ${data.roomName}`)

            // Розсилаємо повідомлення ЛОКАЛЬНИМ клієнтам, виключаючи оригінального відправника
            this.broadcastToRoom(data.roomName, JSON.stringify(data.payload) /*, data.excludeId*/)
        } catch (error) {
            this.#logger?.error('Помилка обробки повідомлення від PubSub брокера:', error)
        }
    }

    /**
     * Публікує повідомлення в брокер PubSub для розсилки на інші інстанси сервера.
     * @param {string} roomName - Назва кімнати, куди адресується повідомлення.
     * @param {object} payload - Дані повідомлення.
     * @param {string | null} [originalSenderId=null] - ID клієнта-відправника.
     */
    publishToBroker(roomName, payload, originalSenderId = null) {
        if (this.#pubSubBroker) {
            const channel = `ws:${this.name}`
            const message = JSON.stringify({
                roomName,
                payload,
                excludeId: originalSenderId, // ID, який треба ігнорувати на інших серверах
            })
            this.#pubSubBroker.publish(channel, message)
        }
    }

    /**
     * Додає з'єднання до кімнати в цьому просторі імен.
     * Створює кімнату, якщо вона ще не існує.
     * @param {string} roomName - Назва кімнати.
     * @param {string} connectionId - ID з'єднання.
     */
    joinRoom(roomName, connectionId) {
        if (!this.#rooms.has(roomName)) {
            // При створенні кімнати передаємо в неї глобальну мапу з'єднань ТА логер
            this.#rooms.set(
                roomName,
                new WebSocketRoom(`${this.name}::${roomName}`, this.#allConnections, this.#logger),
            )
        }

        const room = this.#rooms.get(roomName)
        room.addConnection(connectionId)

        const connection = this.#allConnections.get(connectionId)
        if (connection) {
            connection.joinRoom(this.name, roomName)
        }
        this.#logger?.info(`Connection ${connectionId} joined room ${roomName} in NS ${this.name}.`)
    }

    /**
     * Видаляє з'єднання з кімнати.
     * @param {string} roomName - Назва кімнати.
     * @param {string} connectionId - ID з'єднання.
     */
    leaveRoom(roomName, connectionId) {
        const room = this.#rooms.get(roomName)
        if (room) {
            room.removeConnection(connectionId)
            this.#logger?.info(
                `Connection ${connectionId} left room ${roomName} in NS ${this.name}.`,
            )

            // Видаляємо кімнату, якщо вона порожня
            if (room.size === 0) {
                this.#rooms.delete(roomName)
                this.#logger?.debug(
                    `Room ${roomName} in NS ${this.name} is now empty and was removed.`,
                )
            }
        }

        const connection = this.#allConnections.get(connectionId)
        if (connection) {
            connection.leaveRoom(this.name, roomName)
        }
    }

    /**
     * Транслює повідомлення всім клієнтам в указаній кімнаті цього простору імен.
     * Делегує виконання класу WebSocketRoom.
     * @param {string} roomName - Назва кімнати.
     * @param {*} data - Дані для відправки.
     * @param {object} [options={}] - Додаткові опції для методу send.
     * @param {string | string[] | null} [excludeConnectionIds=null] - ID з'єднань, які потрібно виключити.
     */
    broadcastToRoom(roomName, data, options = {}, excludeConnectionIds = null) {
        const room = this.#rooms.get(roomName)

        if (!room) {
            this.#logger?.warn(
                `Attempted to broadcast to non-existent or empty room ${roomName} in NS ${this.name}.`,
            )
            return
        }

        // Делегуємо виконання кімнаті, вона вже має логер і вміє обробляти масив виключень
        room.broadcast(data, options, excludeConnectionIds)
    }

    /**
     * Транслює повідомлення всім клієнтам у цьому просторі імен (у всіх кімнатах),
     * за винятком вказаних ID з'єднань.
     * @param {*} data - Дані для відправки.
     * @param {object} [options={}] - Опції для методу send.
     * @param {string | string[] | null} [excludeConnectionIds=null] - ID з'єднань, які потрібно виключити.
     */
    broadcast(data, options = {}, excludeConnectionIds = null) {
        const excludes = new Set(
            Array.isArray(excludeConnectionIds)
                ? excludeConnectionIds
                : excludeConnectionIds
                ? [excludeConnectionIds]
                : [],
        )
        let recipientsCount = 0

        for (const connection of this.#allConnections.values()) {
            if (excludes.has(connection.id)) {
                continue
            }

            if (connection.isInNamespace(this.name)) {
                try {
                    connection.send(data, options)
                    recipientsCount++
                } catch (error) {
                    this.#logger?.error(
                        `Failed to broadcast to ${connection.id} in NS ${this.name}:`,
                        error,
                    )
                }
            }
        }
        this.#logger?.debug(
            `Broadcasted message to ${recipientsCount} recipients across NS ${this.name}.`,
        )
    }
}

export default WebSocketNamespace
