/**
 * Інтерфейс адаптера стану.
 * Описує методи керування розподіленим станом користувачів та кімнат у межах кластера.
 * @interface
 */
export class IStateAdapter {
    /**
     * Додає підключення до конкретної кімнати.
     * @param {string} ns - Простір імен (Namespace).
     * @param {string} room - Назва кімнати.
     * @param {string} socketId - Унікальний ідентифікатор сокета.
     * @returns {Promise<void>}
     * @abstract
     */
    async addUserToRoom(ns, room, socketId) {
        throw new Error('Method "addUserToRoom" must be implemented')
    }

    /**
     * Видаляє підключення з конкретної кімнати.
     * @param {string} ns - Простір імен.
     * @param {string} room - Назва кімнати.
     * @param {string} socketId - Ідентифікатор сокета.
     * @returns {Promise<void>}
     * @abstract
     */
    async removeUserFromRoom(ns, room, socketId) {
        throw new Error('Method "removeUserFromRoom" must be implemented')
    }

    /**
     * Повертає список ідентифікаторів усіх сокетів у кімнаті.
     * @param {string} ns - Простір імен.
     * @param {string} room - Назва кімнати.
     * @returns {Promise<string[]>} Список socketId.
     * @abstract
     */
    async getClientsInRoom(ns, room) {
        throw new Error('Method "getClientsInRoom" must be implemented')
    }

    /**
     * Повертає список кімнат, у яких перебуває конкретний сокет.
     * @param {string} ns - Простір імен.
     * @param {string} socketId - Ідентифікатор сокета.
     * @returns {Promise<string[]>} Список назв кімнат.
     * @abstract
     */
    async getUserRooms(ns, socketId) {
        throw new Error('Method "getUserRooms" must be implemented')
    }

    /**
     * Перевіряє, чи є сокет учасником конкретної кімнати.
     * @param {string} ns - Простір імен.
     * @param {string} room - Назва кімнати.
     * @param {string} socketId - Ідентифікатор сокета.
     * @returns {Promise<boolean>}
     * @abstract
     */
    async isMember(ns, room, socketId) {
        throw new Error('Method "isMember" must be implemented')
    }

    /**
     * Отримує всі активні з'єднання.
     * @param {string|null} [ns=null] - Опціональний фільтр за простором імен.
     * @returns {Promise<string[]>} Список ідентифікаторів з'єднань.
     * @abstract
     */
    async getAllConnections(ns = null) {
        throw new Error('Method "getAllConnections" must be implemented')
    }

    /**
     * Очищує дані поточного вузла сервера в загальному стані.
     * Використовується при вимкненні або перезавантаженні інстансу.
     * @returns {Promise<void>}
     * @abstract
     */
    async clearServerData() {
        throw new Error('Method "clearServerData" must be implemented')
    }
}
