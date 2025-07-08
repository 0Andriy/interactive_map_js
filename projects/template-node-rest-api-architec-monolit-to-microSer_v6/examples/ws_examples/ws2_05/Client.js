// src/server/Client.js
import { v4 as uuidv4 } from 'uuid'

class Client {
    constructor(ws, defaultNamespaces = ['default']) {
        this.id = uuidv4() // Унікальний ID клієнта
        this.ws = ws // Посилання на WebSocket з'єднання
        this.rooms = new Set() // Назви кімнат, до яких належить клієнт
        this.namespaces = new Set(defaultNamespaces) // Назви просторів імен
        this.userData = null // Для зберігання даних користувача (наприклад, після аутентифікації)
    }

    /**
     * Надсилає повідомлення клієнту.
     * @param {object} messageData - Дані повідомлення (буде JSON.stringified).
     */
    send(messageData) {
        if (this.ws.readyState === this.ws.OPEN) {
            this.ws.send(JSON.stringify(messageData))
        } else {
            console.warn(`Attempted to send to closed client ${this.id}`)
        }
    }

    /**
     * Приєднує клієнта до кімнати.
     * @param {string} roomName
     */
    joinRoom(roomName) {
        this.rooms.add(roomName)
    }

    /**
     * Видаляє клієнта з кімнати.
     * @param {string} roomName
     */
    leaveRoom(roomName) {
        this.rooms.delete(roomName)
    }

    /**
     * Перевіряє, чи належить клієнт до певної кімнати.
     * @param {string} roomName
     * @returns {boolean}
     */
    isInRoom(roomName) {
        return this.rooms.has(roomName)
    }

    /**
     * Додає клієнта до простору імен.
     * @param {string} namespaceName
     */
    addNamespace(namespaceName) {
        this.namespaces.add(namespaceName)
    }

    /**
     * Видаляє клієнта з простору імен.
     * @param {string} namespaceName
     */
    removeNamespace(namespaceName) {
        this.namespaces.delete(namespaceName)
    }

    /**
     * Перевіряє, чи належить клієнт до певного простору імен.
     * @param {string} namespaceName
     * @returns {boolean}
     */
    isInNamespace(namespaceName) {
        return this.namespaces.has(namespaceName)
    }
}

export default Client
