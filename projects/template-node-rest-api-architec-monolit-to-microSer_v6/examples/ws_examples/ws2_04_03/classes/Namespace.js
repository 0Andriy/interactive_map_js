import { WebSocket } from 'ws'

/**
 * Базовий клас для всіх просторів імен.
 * Надає загальну логіку для керування клієнтами та кімнатами всередині namespace,
 * а також взаємодію з Redis Pub/Sub для широкомовної розсилки.
 */
class Namespace {
    constructor(name, redisClient) {
        this.name = name // Наприклад, '/chat' або '/admin'
        this.redisClient = redisClient
        this.clients = new Map() // socket.id -> WebSocket
        this.rooms = new Map() // room_id -> Set<socket.id> (для кімнат всередині цього namespace)
        this.channel = `ws_namespace:${name.substring(1) || 'default'}` // Redis канал для цього namespace

        // Підписуємося на Redis-канал для міжсерверної комунікації
        this.redisClient.subscribe(this.channel, (message) => {
            try {
                const data = JSON.parse(message)
                // Розсилаємо повідомлення клієнтам в цьому namespace, виключаючи відправника
                this.broadcast(data, data.excludeSocketId)
            } catch (error) {
                console.error(`Error processing Redis message for ${this.name}:`, error)
            }
        })

        console.log(`Namespace initialized: ${this.name}. Redis channel: ${this.channel}`)
    }

    /**
     * Додає новий клієнтський сокет до цього простору імен.
     * @param {WebSocket} ws - Об'єкт WebSocket.
     * @param {string} userId - ID користувача.
     * @param {string} username - Ім'я користувача.
     */
    addClient(ws, userId, username) {
        ws.id = this._generateSocketId() // Призначаємо унікальний ID сокету
        ws.userId = userId
        ws.username = username
        ws.namespace = this.name // Позначаємо, до якого namespace належить сокет
        this.clients.set(ws.id, ws)
        console.log(`[${this.name}] Client ${username} (${ws.id}) connected.`)
        ws.send(
            JSON.stringify({
                type: 'system',
                namespace: this.name,
                message: `Welcome to ${this.name}, ${username}!`,
            }),
        )

        // Додаткові обробники подій для цього сокета
        ws.on('message', (message) => this.handleMessage(ws, message))
        ws.on('close', () => this.removeClient(ws.id))
        ws.on('error', (err) => console.error(`[${this.name}] Socket error for ${ws.id}:`, err))
    }

    /**
     * Видаляє клієнтський сокет з цього простору імен.
     * @param {string} wsId - ID сокета для видалення.
     */
    removeClient(wsId) {
        const ws = this.clients.get(wsId)
        if (ws) {
            console.log(`[${this.name}] Client ${ws.username} (${wsId}) disconnected.`)
            this.clients.delete(wsId)
            // Видаляємо сокет з усіх кімнат цього namespace
            for (const roomSockets of this.rooms.values()) {
                roomSockets.delete(wsId)
            }
        }
    }

    /**
     * Додає сокет до "кімнати" всередині цього простору імен.
     * @param {string} wsId - ID сокета.
     * @param {string} roomId - ID кімнати.
     */
    joinRoom(wsId, roomId) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Set())
        }
        this.rooms.get(roomId).add(wsId)
        console.log(`[${this.name}] Client ${wsId} joined room ${roomId}`)
    }

    /**
     * Видаляє сокет з "кімнати" всередині цього простору імен.
     * @param {string} wsId - ID сокета.
     * @param {string} roomId - ID кімнати.
     */
    leaveRoom(wsId, roomId) {
        if (this.rooms.has(roomId)) {
            this.rooms.get(roomId).delete(wsId)
            if (this.rooms.get(roomId).size === 0) {
                this.rooms.delete(roomId)
            }
            console.log(`[${this.name}] Client ${wsId} left room ${roomId}`)
        }
    }

    /**
     * Розсилає повідомлення всім клієнтам в цьому просторі імен.
     * Якщо в даних вказано roomId, розсилає тільки клієнтам у цій кімнаті.
     * @param {object} data - Дані повідомлення.
     * @param {string} [excludeSocketId=null] - ID сокета, який потрібно виключити з розсилки.
     */
    broadcast(data, excludeSocketId = null) {
        const message = JSON.stringify(data)
        if (data.roomId) {
            // Якщо повідомлення призначено для конкретної кімнати
            if (this.rooms.has(data.roomId)) {
                const targetSockets = this.rooms.get(data.roomId)
                for (const socketId of targetSockets) {
                    if (socketId !== excludeSocketId) {
                        const ws = this.clients.get(socketId)
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(message)
                        }
                    }
                }
            }
        } else {
            // Якщо повідомлення для всього namespace
            for (const ws of this.clients.values()) {
                if (ws.id !== excludeSocketId && ws.readyState === WebSocket.OPEN) {
                    ws.send(message)
                }
            }
        }
    }

    /**
     * Публікує повідомлення в Redis-канал цього простору імен для міжсерверної комунікації.
     * @param {object} data - Дані повідомлення.
     * @param {string} [excludeSocketId=null] - ID сокета, який потрібно виключити (для коректної обробки на інших інстансах).
     */
    async publishToNamespace(data, excludeSocketId = null) {
        data.excludeSocketId = excludeSocketId // Позначити відправника
        await this.redisClient.publish(this.channel, JSON.stringify(data))
    }

    /**
     * Обробляє вхідні повідомлення від клієнта.
     * Цей метод повинен бути перевизначений у дочірніх класах.
     * @param {WebSocket} ws - Відправник повідомлення.
     * @param {Buffer} message - Сирі дані повідомлення.
     */
    async handleMessage(ws, message) {
        console.warn(`[${this.name}] handleMessage not implemented for base Namespace.`)
        ws.send(
            JSON.stringify({
                type: 'error',
                message: 'Message handling not defined for this namespace.',
            }),
        )
    }

    // Приватний метод для генерації ID сокета
    _generateSocketId() {
        return (
            Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15)
        )
    }
}

export default Namespace
