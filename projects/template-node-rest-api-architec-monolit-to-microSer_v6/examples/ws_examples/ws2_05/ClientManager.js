// src/server/ClientManager.js
import Client from './Client.js'
import Room from './Room.js'

class ClientManager {
    constructor() {
        this.clients = new Map() // Map<clientId, Client>
        this.rooms = new Map() // Map<roomName, Room>
    }

    /**
     * Додає новий WebSocket як клієнта.
     * @param {WebSocket} ws - Об'єкт WebSocket.
     * @returns {Client} - Створений об'єкт клієнта.
     */
    addClient(ws) {
        // Встановлюємо початкові простори імен
        const client = new Client(ws, ['default_global_ns'])
        this.clients.set(client.id, client)
        return client
    }

    /**
     * Видаляє клієнта за ID.
     * При видаленні клієнта, оновлюємо лічильники користувачів у кімнатах, до яких він належав.
     * @param {string} clientId - ID клієнта.
     */
    removeClient(clientId) {
        const client = this.clients.get(clientId)
        if (client) {
            client.rooms.forEach((roomName) => {
                const room = this.rooms.get(roomName)
                if (room) {
                    room.decrementUserCount()
                }
            })
            this.clients.delete(clientId)
        }
    }

    /**
     * Повертає клієнта за ID.
     * @param {string} clientId - ID клієнта.
     * @returns {Client|undefined}
     */
    getClient(clientId) {
        return this.clients.get(clientId)
    }

    /**
     * Повертає ітератор по всіх клієнтах.
     * @returns {IterableIterator<Client>}
     */
    getAllClients() {
        return this.clients.values()
    }

    /**
     * Повертає клієнтів, які належать до певного простору імен.
     * @param {string} namespaceName
     * @returns {Client[]}
     */
    getClientsInNamespace(namespaceName) {
        return Array.from(this.clients.values()).filter((client) =>
            client.isInNamespace(namespaceName),
        )
    }

    /**
     * Повертає об'єкт Room за назвою або створює його, якщо він не існує.
     * @param {string} roomName
     * @returns {Room}
     */
    _getOrCreateRoom(roomName) {
        if (!this.rooms.has(roomName)) {
            const newRoom = new Room(roomName)
            this.rooms.set(roomName, newRoom)
            console.log(`Room '${roomName}' created.`)
        }
        return this.rooms.get(roomName)
    }

    /**
     * Повертає об'єкт Room.
     * @param {string} roomName
     * @returns {Room|undefined}
     */
    getRoom(roomName) {
        return this.rooms.get(roomName)
    }
}

export default ClientManager
