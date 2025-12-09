// src/core/User.js

export class User {
    /**
     * @param {string} userId Унікальний ID користувача
     */
    constructor(userId) {
        this.id = userId
        /** @type {Set<string>} */
        this.connectionIds = new Set() // ID усіх активних підключень
    }

    /**
     * Додає Connection ID користувачу.
     * @param {string} connectionId
     */
    addConnection(connectionId) {
        this.connectionIds.add(connectionId)
    }

    /**
     * Видаляє Connection ID користувача.
     * @param {string} connectionId
     */
    removeConnection(connectionId) {
        this.connectionIds.delete(connectionId)
    }

    /**
     * Повертає кількість активних підключень.
     * @returns {number}
     */
    size() {
        return this.connectionIds.size
    }
}
