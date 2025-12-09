// src/core/Connection.js

export class Connection {
    /**
     * @param {string} id Унікальний ID підключення (UUID)
     * @param {object} ws Об'єкт ws-бібліотеки
     * @param {string} userId ID користувача, до якого належить це підключення
     */
    constructor(id, ws, userId) {
        this.id = id
        this.ws = ws
        this.userId = userId
        this.rooms = new Set() // Кімнати, в яких знаходиться це підключення
    }

    /**
     * Надсилає дані цьому конкретному підключенню.
     * @param {string} type Тип повідомлення
     * @param {object} payload Дані
     */
    send(type, payload) {
        if (this.ws.readyState === this.ws.OPEN) {
            const data = JSON.stringify({ type, payload })
            this.ws.send(data)
        }
    }

    // Методи для приєднання/виходу з кімнат
    joinRoom(roomId) {
        this.rooms.add(roomId)
    }

    leaveRoom(roomId) {
        this.rooms.delete(roomId)
    }

    isInRoom(roomId) {
        return this.rooms.has(roomId)
    }
}
