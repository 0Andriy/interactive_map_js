// src/core/Room.js

export class Room {
    /**
     * @param {string} roomId
     * @param {import('../di/Logger.js').Logger} logger
     */
    constructor(roomId, logger) {
        this.id = roomId
        this.logger = logger
        /** @type {Set<string>} */
        this.connectionIds = new Set() // ID підключень, які знаходяться в цій кімнаті
        this.createdAt = Date.now()
        // this.ownerId = null;
    }

    /**
     * Додає Connection ID до кімнати.
     * @param {string} connectionId
     */
    addConnection(connectionId) {
        if (!this.connectionIds.has(connectionId)) {
            this.connectionIds.add(connectionId)
        }
    }

    /**
     * Видаляє Connection ID з кімнати.
     * @param {string} connectionId
     */
    removeConnection(connectionId) {
        this.connectionIds.delete(connectionId)
    }

    /**
     * Отримує всі ID підключень у кімнаті.
     * @returns {Set<string>}
     */
    getConnections() {
        return this.connectionIds
    }

    /**
     * Повертає кількість підключень.
     * @returns {number}
     */
    size() {
        return this.connectionIds.size
    }
}
