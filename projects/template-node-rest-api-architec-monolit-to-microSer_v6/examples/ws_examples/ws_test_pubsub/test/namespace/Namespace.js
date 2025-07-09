// src/namespace/Namespace.js

import { Room } from '../room/Room.js'
import { Client } from '../core/Client.js' // Імпортуємо Client

/**
 * Представляє окремий простір імен (namespace), який керує своїми кімнатами
 * та всіма клієнтами (Client об'єктами), які підключені до цього неймспейсу.
 */
class Namespace {
    /**
     * @param {string} path - Шлях неймспейсу (наприклад, '/').
     * @param {object} server - Посилання на центральний об'єкт Server.
     * @param {object} [logger=defaultLoggerInstance] - Логер.
     */
    constructor(path, server, logger = console) {
        if (!path || !server) {
            throw new Error('Namespace must have a path and a server instance.')
        }
        this.path = path // Шлях неймспейсу, наприклад, '/' або '/admin'
        this.server = server // Посилання на центральний об'єкт Server
        this.logger = logger

        this.rooms = new Map() // Кімнати в цьому неймспейсі
        this.clients = new Map() // Усі КЛІЄНТИ (Client об'єкти), підключені до ЦЬОГО неймспейсу

        this.logger.info(`Namespace "${this.path}" created.`)
    }

    /**
     * @private
     * Додає клієнта до списку клієнтів цього неймспейсу.
     * Викликається ззовні (Server або Room).
     * @param {Client} client - Об'єкт клієнта.
     */
    _addClient(client) {
        if (!(client instanceof Client)) {
            this.logger.error(`Attempted to add non-Client object to Namespace "${this.path}".`)
            return
        }
        if (!this.clients.has(client.id)) {
            this.clients.set(client.id, client)
            this.logger.debug(
                `Client connection "${client.id}" for User "${client.username}" (ID: ${client.userId}) added to Namespace "${this.path}". Total connections: ${this.clients.size}`,
            )
        }
    }

    /**
     * @private
     * Видаляє клієнта зі списку клієнтів цього неймспейсу.
     * Викликається ззовні (Server або Room).
     * @param {Client} client - Об'єкт клієнта.
     */
    _removeClient(client) {
        if (!(client instanceof Client)) {
            this.logger.error(
                `Attempted to remove non-Client object from Namespace "${this.path}".`,
            )
            return
        }
        // Перевіряємо, чи клієнт все ще перебуває в якійсь кімнаті цього неймспейсу
        let isClientStillInAnyRoom = false
        for (const room of this.rooms.values()) {
            if (room.getClients().some((c) => c.id === client.id)) {
                // Перевірка за ID
                isClientStillInAnyRoom = true
                break
            }
        }

        // Видаляємо клієнта з неймспейсу, тільки якщо він більше не в жодній його кімнаті
        // Або якщо він взагалі виходить з неймспейсу
        if (!isClientStillInAnyRoom) {
            if (this.clients.delete(client.id)) {
                this.logger.debug(
                    `Client connection "${client.id}" for User "${client.username}" (ID: ${client.userId}) removed from Namespace "${this.path}". Total connections: ${this.clients.size}`,
                )
            }
        } else {
            this.logger.debug(
                `Client connection "${client.id}" for User "${client.username}" (ID: ${client.userId}) is still in other rooms of Namespace "${this.path}". Not removing from namespace's connection list yet.`,
            )
        }
    }

    /**
     * Повертає список усіх кімнат у цьому неймспейсі.
     * @returns {Array<Room>}
     */
    getAllRooms() {
        return Array.from(this.rooms.values())
    }

    /**
     * Повертає список усіх клієнтів (Client об'єктів), підключених до цього неймспейсу.
     * @returns {Array<Client>}
     */
    getAllClients() {
        return Array.from(this.clients.values())
    }

    /**
     * Отримує кімнату з ЦЬОГО простору імен за її ID.
     * @param {string} id - ID кімнати.
     * @returns {Room|undefined} - Об'єкт кімнати або undefined, якщо не знайдено.
     */
    getRoom(id) {
        return this.rooms.get(id)
    }

    /**
     * Створює нову кімнату в ЦЬОМУ просторі імен.
     * У Socket.IO кімнати часто створюються неявно при першому приєднанні сокета.
     * Тут ми дозволимо явне створення.
     * @param {string} [id] - ID кімнати (генерується, якщо не надано).
     * @param {string} [name] - Назва кімнати (генерується, якщо не надано).
     * @returns {Room} - Створена або існуюча кімната.
     */
    createRoom(id, name, isPersistent = false) {
        if (id && this.rooms.has(id)) {
            this.logger.warn(`Room with ID "${id}" already exists in Namespace "${this.path}".`)
            return this.rooms.get(id)
        }
        // Room тепер отримує посилання на поточний Namespace
        const newRoom = new Room({
            id,
            name,
            namespace: this,
            logger: this.logger,
            isPersistent: isPersistent,
        })
        this.rooms.set(newRoom.id, newRoom)
        this.logger.info(
            `Room "${newRoom.name}" created with ID "${newRoom.id}" in Namespace "${this.path}".`,
        )
        return newRoom
    }

    /**
     * Видаляє кімнату з ЦЬОГО простору імен за її ID.
     * @param {string} id - ID кімнати.
     * @returns {boolean} - True, якщо кімнату було видалено, false інакше.
     */
    deleteRoom(id) {
        const roomToDelete = this.rooms.get(id)
        if (roomToDelete) {
            // Перед знищенням кімнати, переконуємося, що всі її клієнти відмічені як такі, що вийшли
            roomToDelete.getClients().forEach((client) => {
                // Це важливо: клієнт повинен бути видалений з allClients неймспейсу
                // тільки якщо він більше не в жодній кімнаті цього неймспейсу.
                // _removeClient() це перевіряє.
                this._removeClient(client)
            })
            roomToDelete.destroy() // Це зупинить завдання та очистить клієнтів у кімнаті
            if (this.rooms.delete(id)) {
                this.logger.info(`Room with ID "${id}" deleted from Namespace "${this.path}".`)
                return true
            }
        }
        this.logger.warn(`Room with ID "${id}" not found in Namespace "${this.path}".`)
        return false
    }

    /**
     * Надсилає повідомлення всім клієнтам, підключеним до цього неймспейсу.
     * @param {string} message - Текст повідомлення.
     * @param {object} [options={}] - Налаштування повідомлення (може включати type, metadata, excludeClients).
     * @returns {number} - Кількість клієнтів, яким було надіслано повідомлення.
     */
    sendMessage(message, options = {}) {
        const { excludeClients = [], type = 'info', metadata = {} } = options
        const excludedClientIds = new Set(excludeClients.map((c) => c.id)) // Виключаємо за ID

        const messagePayload = {
            message,
            type,
            timestamp: new Date().toISOString(),
            namespacePath: this.path,
            ...metadata,
        }

        let sentCount = 0
        this.clients.forEach((client) => {
            if (!excludedClientIds.has(client.id)) {
                // Викликаємо метод send на Client об'єкті
                client.send(messagePayload)
                sentCount++
            }
        })
        this.logger.info(
            `Message sent in Namespace "${this.path}" to ${sentCount} client connections (excluded ${excludedClientIds.size} connections).`,
        )
        return sentCount
    }

    /**
     * Знищує неймспейс, зупиняючи всі кімнати та очищаючи клієнтів.
     */
    destroy() {
        this.logger.info(`Destroying Namespace "${this.path}" and all its rooms.`)
        this.rooms.forEach((room) => room.destroy())
        this.rooms.clear()
        this.clients.clear() // Очищаємо список клієнтів неймспейсу
        this.server = null // Обнуляємо посилання
        this.logger = null
    }
}

export { Namespace }
