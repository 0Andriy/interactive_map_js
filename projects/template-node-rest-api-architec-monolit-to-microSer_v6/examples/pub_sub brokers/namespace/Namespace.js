// src/namespaces/Namespace.js
import Room from './Room.js'

/**
 * @class Namespace
 * @description Представляє логічний простір імен для організації кімнат.
 * Допомагає уникнути конфліктів імен і керувати груповою комунікацією.
 */
class Namespace {
    /**
     * @param {string} name - Унікальне ім'я простору імен (наприклад, 'chat', 'game').
     * @param {import('../brokers/MessageBroker.js').default} broker - Екземпляр брокера повідомлень.
     * @param {object} logger - **ОБОВ'ЯЗКОВО**: Екземпляр логера.
     */
    constructor(name, broker, logger) {
        if (!name) {
            throw new Error('Namespace name is required.')
        }
        if (!broker) {
            throw new Error('MessageBroker instance is required for Namespace.')
        }
        // <-- Додана перевірка на обов'язкову наявність логера
        if (!logger || typeof logger.info !== 'function') {
            throw new Error(
                'Logger instance (with info, warn, error, debug methods) is required for Namespace.',
            )
        }

        this.name = name.startsWith('/') ? name : `/${name}`
        this.broker = broker
        this.logger = logger // Тепер logger завжди надається через DI
        /**
         * @private
         * @type {Map<string, Room>}
         * @description Зберігає кімнати, що належать цьому простору імен.
         */
        this.rooms = new Map()
        this.logger.info(`Namespace '${this.name}' initialized.`)
    }

    /**
     * @method getRoomTopic
     * @description Формує повну назву топіка для кімнати в цьому просторі імен.
     * @param {string} roomName - Ім'я кімнати.
     * @returns {string} Повна назва топіка.
     */
    getRoomTopic(roomName) {
        return `${this.name}/${roomName}`
    }

    /**
     * @method createRoom
     * @description Створює або повертає існуючу кімнату в цьому просторі імен.
     * @param {string} roomName - Ім'я кімнати (наприклад, 'general', 'lobby').
     * @returns {Room} Екземпляр кімнати.
     */
    createRoom(roomName) {
        if (this.rooms.has(roomName)) {
            this.logger.debug(
                `Room '${roomName}' already exists in namespace '${this.name}'. Returning existing instance.`,
            )
            return this.rooms.get(roomName)
        }

        const roomTopic = this.getRoomTopic(roomName)

        const room = new Room(roomName, roomTopic, this.broker, this.logger)
        this.rooms.set(roomName, room)
        this.logger.info(`Room '${roomName}' created in namespace '${this.name}'.`)
        return room
    }

    /**
     * @method getRoom
     * @description Повертає існуючу кімнату за її ім'ям.
     * @param {string} roomName - Ім'я кімнати.
     * @returns {Room | undefined} Екземпляр кімнати або undefined, якщо не знайдено.
     */
    getRoom(roomName) {
        return this.rooms.get(roomName)
    }

    /**
     * @method deleteRoom
     * @description Видаляє кімнату з простору імен.
     * @param {string} roomName - Ім'я кімнати для видалення.
     * @returns {boolean} True, якщо кімнату було видалено, false, якщо не знайдено.
     */
    deleteRoom(roomName) {
        if (this.rooms.has(roomName)) {
            const room = this.rooms.get(roomName)
            room.removeAllSubscribers()
            this.rooms.delete(roomName)
            this.logger.info(`Room '${roomName}' deleted from namespace '${this.name}'.`)
            return true
        }
        this.logger.warn(
            `Attempted to delete non-existent room '${roomName}' in namespace '${this.name}'.`,
        )
        return false
    }

    /**
     * @method getRoomsCount
     * @description Повертає кількість кімнат у цьому просторі імен.
     * @returns {number} Кількість кімнат.
     */
    getRoomsCount() {
        return this.rooms.size
    }
}

export default Namespace
