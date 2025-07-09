// src/namespace/BaseNamespace.js

// Тепер Room імпортується тут, оскільки BaseNamespace керуватиме кімнатами
import { Room } from '../room/Room.js'

/**
 * Базовий клас для просторів імен.
 * Тепер керує своїми кімнатами та відстежує всіх унікальних клієнтів у них.
 */
class BaseNamespace {
    /**
     * @param {string} name - Назва простору імен.
     * @param {object} [logger=defaultLoggerInstance] - Об'єкт логера з методами info, warn, error, debug.
     */
    constructor(name, logger = console) {
        this.name = name
        this.logger = logger
        this.rooms = new Map()
        this.allClients = new Set()

        this.logger.info(
            `BaseNamespace "${this.name}" created, ready to manage its own rooms and clients.`,
        )
    }

    /**
     * Створює нову кімнату в ЦЬОМУ просторі імен.
     * @param {string} [id] - ID кімнати (генерується, якщо не надано).
     * @param {string} [name] - Назва кімнати (генерується, якщо не надано).
     * @returns {Room} - Створена або існуюча кімната.
     */
    createRoom(id, name) {
        if (id && this.rooms.has(id)) {
            this.warn(`Room with ID "${id}" already exists in namespace "${this.name}".`)
            return this.rooms.get(id)
        }
        // Важливо: кімната створюється з посиланням на ЦЕЙ екземпляр namespace
        const newRoom = new Room({ id, name, namespace: this, logger: this.logger })
        this.rooms.set(newRoom.id, newRoom)
        this.info(
            `Room "${newRoom.name}" created with ID "${newRoom.id}" in namespace "${this.name}".`,
        )

        // Додаємо всіх поточних клієнтів нової кімнати до allClients неймспейсу
        // (хоча при створенні кімнати clients порожні, це важливо для "перезавантаження")
        newRoom.getClients().forEach((client) => this.allClients.add(client))

        return newRoom
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
     * Видаляє кімнату з ЦЬОГО простору імен за її ID.
     * @param {string} id - ID кімнати.
     * @returns {boolean} - True, якщо кімнату було видалено, false інакше.
     */
    deleteRoom(id) {
        const roomToDelete = this.rooms.get(id)
        if (roomToDelete) {
            // Перед знищенням кімнати, видаляємо її клієнтів з загального списку неймспейсу
            roomToDelete.getClients().forEach((client) => this.#removeClientFromNamespace(client))
            roomToDelete.destroy() // Це зупинить завдання та очистить клієнтів у кімнаті
            if (this.rooms.delete(id)) {
                this.info(`Room with ID "${id}" deleted from namespace "${this.name}".`)
                return true
            }
        }
        this.warn(`Room with ID "${id}" not found in namespace "${this.name}".`)
        return false
    }

    /**
     * Повертає список усіх кімнат у цьому неймспейсі.
     * @returns {Array<Room>}
     */
    getAllRooms() {
        return Array.from(this.rooms.values())
    }

    /**
     * Повертає список усіх унікальних клієнтів, присутніх у будь-якій кімнаті цього неймспейсу.
     * @returns {Array<object>} - Масив об'єктів клієнтів.
     */
    getAllClientsInNamespace() {
        return Array.from(this.allClients)
    }

    /**
     * Надсилає повідомлення всім унікальним клієнтам у цьому неймспейсі.
     * @param {string} message - Текст повідомлення.
     * @param {object} [options={}] - Налаштування повідомлення (може включати type, metadata).
     * @returns {number} - Кількість клієнтів, яким було надіслано повідомлення.
     */
    sendMessageToAllClientsInNamespace(message, options = {}) {
        const { type = 'info', metadata = {} } = options

        const messagePayload = {
            message,
            type,
            timestamp: new Date().toISOString(),
            namespaceName: this.name,
            ...metadata,
        }

        let sentCount = 0
        this.allClients.forEach((client) => {
            this.logger.debug(
                `[${this.name} to ${client.name} (${client.id}) | Type: ${type}]: ${JSON.stringify(
                    messagePayload,
                )}`,
            )
            // Тут має бути реальна логіка відправки повідомлення клієнту
            // client.socket.send(JSON.stringify(messagePayload));
            sentCount++
        })
        this.logger.info(`Message sent in namespace "${this.name}" to ${sentCount} unique clients.`)
        return sentCount
    }

    /**
     * @private
     * Додає клієнта до загального списку неймспейсу.
     * Викликається з Room.
     * @param {object} client - Об'єкт клієнта.
     */
    #addClientToNamespace(client) {
        if (!this.allClients.has(client)) {
            this.allClients.add(client)
            this.logger.debug(
                `Client ${client.name} (ID: ${client.id}) added to namespace "${this.name}" clients. Total: ${this.allClients.size}`,
            )
        }
    }

    /**
     * @private
     * Видаляє клієнта із загального списку неймспейсу,
     * якщо він більше не присутній у жодній кімнаті цього неймспейсу.
     * Викликається з Room.
     * @param {object} client - Об'єкт клієнта.
     */
    #removeClientFromNamespace(client) {
        let isClientStillPresentInAnyRoom = false
        for (const room of this.rooms.values()) {
            if (room.getClients().includes(client)) {
                isClientStillPresentInAnyRoom = true
                break
            }
        }

        if (!isClientStillPresentInAnyRoom) {
            this.allClients.delete(client)
            this.logger.debug(
                `Client ${client.name} (ID: ${client.id}) removed from namespace "${this.name}" clients. Total: ${this.allClients.size}`,
            )
        } else {
            this.logger.debug(
                `Client ${client.name} (ID: ${client.id}) is still in other rooms in namespace "${this.name}". Not removed from namespace clients.`,
            )
        }
    }
}

// Експортуємо єдиний екземпляр для використання за замовчуванням
export const DEFAULT_NAMESPACE_INSTANCE = new BaseNamespace(
    'DefaultGlobalNamespace',
    defaultLoggerInstance,
)

export { BaseNamespace }
