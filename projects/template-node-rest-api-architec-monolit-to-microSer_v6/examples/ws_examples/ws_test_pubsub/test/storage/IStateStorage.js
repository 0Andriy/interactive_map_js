// src/storage/IStateStorage.js

/**
 * Інтерфейс для зберігання стану сервера (клієнти, кімнати, неймспейси, повідомлення).
 * Це буде контракт, який повинні реалізувати як In-Memory, так і Redis сховища.
 * Усі методи повертають Promise.
 *
 * @interface
 */
class IStateStorage {
    constructor(logger = console) {
        this.logger = logger
        if (new.target === IStateStorage) {
            throw new TypeError(
                'Cannot construct IStateStorage instances directly. Implement this interface.',
            )
        }
    }

    // --- Клієнти ---
    /**
     * Додає інформацію про клієнта до сховища.
     * @param {import('../core/definitions').ClientInfo} clientInfo - Об'єкт з інформацією про клієнта.
     * @returns {Promise<boolean>} True, якщо клієнта додано.
     */
    async addClient(clientInfo) {
        throw new Error("Method 'addClient()' must be implemented.")
    }

    /**
     * Отримує інформацію про клієнта за його ID.
     * @param {string} clientId
     * @returns {Promise<import('../core/definitions').ClientInfo|undefined>}
     */
    async getClient(clientId) {
        throw new Error("Method 'getClient()' must be implemented.")
    }

    /**
     * Видаляє інформацію про клієнта за його ID.
     * @param {string} clientId
     * @returns {Promise<boolean>} True, якщо клієнта видалено.
     */
    async removeClient(clientId) {
        throw new Error("Method 'removeClient()' must be implemented.")
    }

    /**
     * Отримує список усіх клієнтів, що належать конкретному користувачеві.
     * @param {string} userId
     * @returns {Promise<Array<import('../core/definitions').ClientInfo>>}
     */
    async getClientsByUserId(userId) {
        throw new Error("Method 'getClientsByUserId()' must be implemented.")
    }

    /**
     * Отримує список усієї інформації про підключених клієнтів.
     * @returns {Promise<Array<import('../core/definitions').ClientInfo>>}
     */
    async getAllClients() {
        throw new Error("Method 'getAllClients()' must be implemented.")
    }

    /**
     * Перевіряє, чи існує клієнт з даним ID у сховищі.
     * @param {string} clientId
     * @returns {Promise<boolean>}
     */
    async clientExists(clientId) {
        throw new Error("Method 'clientExists()' must be implemented.")
    }

    // --- Неймспейси ---
    /**
     * Додає інформацію про неймспейс до сховища.
     * @param {string} namespacePath
     * @param {import('../core/definitions').NamespaceInfo} namespaceInfo
     * @returns {Promise<boolean>} True, якщо неймспейс додано.
     */
    async addNamespace(namespacePath, namespaceInfo) {
        throw new Error("Method 'addNamespace()' must be implemented.")
    }

    /**
     * Отримує інформацію про неймспейс за його шляхом.
     * @param {string} namespacePath
     * @returns {Promise<import('../core/definitions').NamespaceInfo|undefined>}
     */
    async getNamespace(namespacePath) {
        throw new Error("Method 'getNamespace()' must be implemented.")
    }

    /**
     * Перевіряє, чи існує неймспейс з даним шляхом.
     * @param {string} namespacePath
     * @returns {Promise<boolean>}
     */
    async namespaceExists(namespacePath) {
        throw new Error("Method 'namespaceExists()' must be implemented.")
    }

    /**
     * Видаляє інформацію про неймспейс та всі його кімнати зі сховища.
     * @param {string} namespacePath
     * @returns {Promise<boolean>} True, якщо неймспейс видалено.
     */
    async removeNamespace(namespacePath) {
        throw new Error("Method 'removeNamespace()' must be implemented.")
    }

    /**
     * Отримує список усіх шляхів неймспейсів.
     * @returns {Promise<Array<string>>}
     */
    async getAllNamespaces() {
        throw new Error("Method 'getAllNamespaces()' must be implemented.")
    }

    // --- Кімнати ---
    /**
     * Додає інформацію про кімнату до сховища.
     * @param {string} namespacePath
     * @param {import('../core/definitions').RoomInfo} roomInfo
     * @returns {Promise<boolean>} True, якщо кімнату додано.
     */
    async addRoom(namespacePath, roomInfo) {
        throw new Error("Method 'addRoom()' must be implemented.")
    }

    /**
     * Отримує інформацію про кімнату за її ID та шляхом неймспейсу.
     * @param {string} namespacePath
     * @param {string} roomId
     * @returns {Promise<import('../core/definitions').RoomInfo|undefined>}
     */
    async getRoom(namespacePath, roomId) {
        throw new Error("Method 'getRoom()' must be implemented.")
    }

    /**
     * Видаляє інформацію про кімнату та всіх клієнтів з неї.
     * @param {string} namespacePath
     * @param {string} roomId
     * @returns {Promise<boolean>} True, якщо кімнату видалено.
     */
    async removeRoom(namespacePath, roomId) {
        throw new Error("Method 'removeRoom()' must be implemented.")
    }

    /**
     * Перевіряє, чи існує кімната з даним ID у даному неймспейсі.
     * @param {string} namespacePath
     * @param {string} roomId
     * @returns {Promise<boolean>}
     */
    async roomExists(namespacePath, roomId) {
        throw new Error("Method 'roomExists()' must be implemented.")
    }

    /**
     * Отримує список усієї інформації про кімнати в даному неймспейсі.
     * @param {string} namespacePath
     * @returns {Promise<Array<import('../core/definitions').RoomInfo>>}
     */
    async getRoomsByNamespace(namespacePath) {
        throw new Error("Method 'getRoomsByNamespace()' must be implemented.")
    }

    /**
     * Додає клієнта до кімнати.
     * @param {string} namespacePath
     * @param {string} roomId
     * @param {string} clientId
     * @returns {Promise<boolean>} True, якщо клієнта додано до кімнати.
     */
    async addClientToRoom(namespacePath, roomId, clientId) {
        throw new Error("Method 'addClientToRoom()' must be implemented.")
    }

    /**
     * Видаляє клієнта з кімнати.
     * @param {string} namespacePath
     * @param {string} roomId
     * @param {string} clientId
     * @returns {Promise<boolean>} True, якщо клієнта видалено з кімнати.
     */
    async removeClientFromRoom(namespacePath, roomId, clientId) {
        throw new Error("Method 'removeClientFromRoom()' must be implemented.")
    }

    /**
     * Отримує список інформації про клієнтів, які перебувають у даній кімнаті.
     * @param {string} namespacePath
     * @param {string} roomId
     * @returns {Promise<Array<import('../core/definitions').ClientInfo>>}
     */
    async getClientsInRoom(namespacePath, roomId) {
        throw new Error("Method 'getClientsInRoom()' must be implemented.")
    }

    /**
     * Підраховує кількість клієнтів у даній кімнаті.
     * @param {string} namespacePath
     * @param {string} roomId
     * @returns {Promise<number>}
     */
    async countClientsInRoom(namespacePath, roomId) {
        throw new Error("Method 'countClientsInRoom()' must be implemented.")
    }

    // --- Pub/Sub для обміну повідомленнями між інстансами ---
    /**
     * Публікує повідомлення в канал.
     * @param {string} channel
     * @param {object} message
     * @returns {Promise<boolean>}
     */
    async publish(channel, message) {
        throw new Error("Method 'publish()' must be implemented.")
    }

    /**
     * Підписується на канал.
     * @param {string} channel
     * @param {(channel: string, message: object) => void} callback
     * @returns {Promise<boolean>}
     */
    async subscribe(channel, callback) {
        throw new Error("Method 'subscribe()' must be implemented.")
    }

    /**
     * Відписується від каналу.
     * @param {string} channel
     * @param {(channel: string, message: object) => void} callback
     * @returns {Promise<boolean>}
     */
    async unsubscribe(channel, callback) {
        throw new Error("Method 'unsubscribe()' must be implemented.")
    }

    // --- Загальні методи ---
    /**
     * Очищає всі дані зі сховища (використовувати обережно, в основному для тестування).
     * @returns {Promise<boolean>}
     */
    async clearAll() {
        throw new Error("Method 'clearAll()' must be implemented.")
    }

    /**
     * Відключає сховище (наприклад, закриває з'єднання з базою даних).
     * @returns {Promise<boolean>}
     */
    async disconnect() {
        throw new Error("Method 'disconnect()' must be implemented.")
    }
}

export { IStateStorage }
