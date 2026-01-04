/**
 * @file Abstract class for State Adapters.
 * @module interfaces/StateAdapter
 */

/**
 * @abstract
 * @class StateAdapter
 * @classdesc Базовий абстрактний клас для адаптерів стану.
 * Визначає контракт для управління розподіленим станом кімнат та сокетів.
 */
export class StateAdapter {
    constructor() {
        if (this.constructor === StateAdapter) {
            /**
             * Забороняємо створення екземпляра самого інтерфейсу.
             * @throws {Error}
             */
            throw new Error("Abstract class 'StateAdapter' cannot be instantiated.")
        }
    }

    /**
     * Додає сокет до конкретної кімнати.
     * @abstract
     * @param {string} ns - Простір імен (Namespace).
     * @param {string} room - Назва кімнати.
     * @param {string} socketId - Унікальний ID сокета.
     * @returns {Promise<void>}
     * @throws {Error} Якщо метод не реалізований.
     */
    async addUserToRoom(ns, room, socketId) {
        throw new Error("Method 'addUserToRoom()' must be implemented.")
    }

    /**
     * Видаляє сокет з кімнати.
     * @abstract
     * @param {string} ns - Простір імен.
     * @param {string} room - Назва кімнати.
     * @param {string} socketId - ID сокета.
     * @returns {Promise<void>}
     */
    async removeUserFromRoom(ns, room, socketId) {
        throw new Error("Method 'removeUserFromRoom()' must be implemented.")
    }

    /**
     * Повертає список всіх socketId, що знаходяться в кімнаті.
     * @abstract
     * @param {string} ns - Простір імен.
     * @param {string} room - Назва кімнати.
     * @returns {Promise<string[]>} Масив ID сокетів.
     */
    async getUsersInRoom(ns, room) {
        throw new Error("Method 'getUsersInRoom()' must be implemented.")
    }

    /**
     * Перевіряє, чи присутній конкретний сокет у кімнаті.
     * @abstract
     * @param {string} ns - Простір імен.
     * @param {string} room - Назва кімнати.
     * @param {string} socketId - ID сокета.
     * @returns {Promise<boolean>}
     */
    async isUserInRoom(ns, room, socketId) {
        throw new Error("Method 'isUserInRoom()' must be implemented.")
    }

    /**
     * Повертає загальну кількість активних з'єднань у всьому неймспейсі.
     * Корисно для моніторингу та балансування навантаження.
     * @abstract
     * @param {string} ns - Простір імен.
     * @returns {Promise<number>} Кількість користувачів.
     */
    async getCountInNamespace(ns) {
        throw new Error("Method 'getCountInNamespace()' must be implemented.")
    }

    /**
     * Повне очищення даних адаптера.
     * Використовується переважно для автоматизованих тестів.
     * @abstract
     * @returns {Promise<void>}
     */
    async clear() {
        throw new Error("Method 'clear()' must be implemented.")
    }
}
