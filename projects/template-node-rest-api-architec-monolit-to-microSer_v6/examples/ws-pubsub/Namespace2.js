// src/core/Namespace.js

import { Connection } from './Connection.js'
import { Room } from './Room.js'
import { User } from './User.js' // Підключаємо User
import { v4 as uuidv4 } from 'uuid'

/**
 * @typedef {function(Connection, object, Namespace): Promise<void>} MessageHandler
 */
export class Namespace {
    /**
     * @param {string} name Ім'я Namespace
     * @param {import('../di/PubSubAdapter.js').PubSubAdapter} pubSubAdapter
     * @param {import('../di/Logger.js').Logger} logger
     * @param {MessageHandler} messageHandler Кастомний обробник вхідних повідомлень
     */
    constructor(name, pubSubAdapter, logger, messageHandler) {
        this.name = name
        this.logger = logger
        this.pubSub = pubSubAdapter
        this.messageHandler = messageHandler // Впроваджений обробник

        /** @type {Map<string, Connection>} */
        this.connections = new Map()
        /** @type {Map<string, Room>} */
        this.rooms = new Map()
        /** @type {Map<string, User>} */
        this.users = new Map() // Мапа для керування User об'єктами

        // ... (PubSub підписка без змін) ...
        this.broadcastChannel = `ns:${this.name}:broadcast`
        this._handleRemoteBroadcastBound = this._handleRemoteBroadcast.bind(this)
        this.pubSub.subscribe(this.broadcastChannel, this._handleRemoteBroadcastBound)

        this.logger.log(`Namespace '${this.name}' initialized with custom handler.`)
    }

    // --- Керування Користувачами ---

    _getOrCreateUser(userId) {
        if (!this.users.has(userId)) {
            const newUser = new User(userId)
            this.users.set(userId, newUser)
        }
        return this.users.get(userId)
    }

    _cleanupUser(userId) {
        const user = this.users.get(userId)
        if (user && user.size() === 0) {
            this.users.delete(userId)
            this.logger.log(`[${this.name}] User ${userId} removed (no active connections).`)
        }
    }

    // --- Керування Підключеннями ---

    addConnection(ws, userId) {
        const connectionId = uuidv4()
        const conn = new Connection(connectionId, ws, userId)
        this.connections.set(connectionId, conn)

        const user = this._getOrCreateUser(userId)
        user.addConnection(connectionId) // Реєструємо підключення у користувача

        this.joinRoom(connectionId, 'general')
        this.logger.log(
            `[${
                this.name
            }] Connection added. ID: ${connectionId}, User: ${userId}. Total user connections: ${user.size()}`,
        )
        return conn
    }

    removeConnection(connectionId) {
        const conn = this.connections.get(connectionId)
        if (conn) {
            // 1. Видаляємо з усіх кімнат
            conn.rooms.forEach((roomId) => this.leaveRoom(connectionId, roomId, true))

            // 2. Видаляємо з об'єкта User
            const user = this.users.get(conn.userId)
            if (user) {
                user.removeConnection(connectionId)
                this._cleanupUser(conn.userId) // Перевіряємо, чи можна видалити User
            }

            // 3. Видаляємо Connection
            this.connections.delete(connectionId)
            this.logger.log(`[${this.name}] Connection removed. ID: ${connectionId}`)
        }
    }

    // --- Надсилання Повідомлень Користувачу (на всі підключення) ---

    async toUser(userId, type, payload) {
        const user = this.users.get(userId)
        if (!user) return

        let sentCount = 0
        for (const connId of user.connectionIds) {
            const conn = this.connections.get(connId)
            if (conn) {
                conn.send(type, payload)
                sentCount++
            }
        }
        this.logger.log(
            `[${this.name}] Message sent to User ${userId} across ${sentCount} connections.`,
            { type },
        )
        // TODO: Додати логіку PubSub для toUser, якщо користувач має підключення на інших інстансах.
    }

    // --- Обробка Вхідних Повідомлень (Виклик Кастомного Обробника) ---

    async handleMessage(connectionId, rawMessage) {
        const conn = this.connections.get(connectionId)
        if (!conn) return

        try {
            const parsedMessage = JSON.parse(rawMessage)
            this.logger.log(`[${this.name}] Received message from ${conn.userId}`, {
                type: parsedMessage.type,
            })

            // !!! ВИКЛИК КАСТОМНОГО ОБРОБНИКА !!!
            await this.messageHandler(conn, parsedMessage, this)
        } catch (error) {
            this.logger.error(`[${this.name}] Error processing message from ${conn.userId}`, error)
        }
    }

    // ... (Методи _getOrCreateRoom, _cleanupRoom, joinRoom, leaveRoom, to, _sendLocal залишаються без змін) ...
}
