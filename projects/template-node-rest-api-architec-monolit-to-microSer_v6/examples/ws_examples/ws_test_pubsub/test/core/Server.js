// src/core/Server.js

import { Namespace } from '../namespace/Namespace.js'
import { Client } from './Client.js'

/**
 * Центральний клас Server, який керує всіма неймспейсами та підключеними клієнтами.
 * Тепер розрізняє підключення (Client) та користувачів (userId).
 */
class Server {
    /**
     * @param {object} [logger=console] - Логер.
     */
    constructor(logger = console) {
        this.logger = logger
        this.namespaces = new Map() // Зберігає всі неймспейси (Map<path, Namespace>)
        this.connectedClients = new Map() // Зберігає всі підключені Client об'єкти (Map<clientId, Client>)
        this.userConnections = new Map() // Зберігає підключення по userId (Map<userId, Set<Client>>)

        this.#createDefaultNamespace()

        this.logger.info('Server initialized. Default namespace "/" created.')
    }

    #createDefaultNamespace() {
        if (!this.namespaces.has('/')) {
            const defaultNamespace = new Namespace('/', this, this.logger)
            this.namespaces.set('/', defaultNamespace)
        }
    }

    /**
     * Отримує або створює неймспейс за його шляхом.
     * Аналог `io.of('/path')`.
     * @param {string} path - Шлях неймспейсу (наприклад, '/' або '/admin').
     * @returns {Namespace} - Об'єкт неймспейсу.
     */
    of(path) {
        if (!path || typeof path !== 'string') {
            this.logger.error('Namespace path must be a non-empty string. Defaulting to "/".')
            path = '/'
        }
        // Normalize path (remove trailing slash unless it's just '/')
        const normalizedPath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path

        if (!this.namespaces.has(normalizedPath)) {
            const newNamespace = new Namespace(normalizedPath, this, this.logger)
            this.namespaces.set(normalizedPath, newNamespace)
            this.logger.info(`New namespace "${normalizedPath}" created via .of() method.`)
        }
        return this.namespaces.get(normalizedPath)
    }

    /**
     * Приймає нове підключення клієнта (реальний WebSocket).
     * @param {string} clientId - Унікальний ID підключення.
     * @param {string} userId - ID користувача.
     * @param {string} username - Ім'я користувача.
     * @param {import('ws').WebSocket} ws - Реальний WebSocket-сокет.
     * @returns {Client} - Створений Client об'єкт.
     */
    addClientConnection(clientId, userId, username, ws) {
        // <--- Оновлені параметри
        if (this.connectedClients.has(clientId)) {
            this.logger.warn(
                `Client connection with ID "${clientId}" already connected. Returning existing client.`,
            )
            return this.connectedClients.get(clientId)
        }

        const client = new Client(clientId, userId, username, ws, this.logger) // <--- Передаємо userId, username
        this.connectedClients.set(client.id, client)

        // Додаємо підключення до реєстру користувачів
        if (!this.userConnections.has(client.userId)) {
            this.userConnections.set(client.userId, new Set())
        }
        this.userConnections.get(client.userId).add(client)

        // Автоматично додаємо клієнта до дефолтного неймспейсу '/'
        const defaultNamespace = this.of('/')
        defaultNamespace._addClient(client)

        this.logger.info(
            `Client connection "${client.id}" for User "${client.username}" (ID: ${client.userId}) connected to Server and joined default namespace "/".`,
        )
        return client
    }

    /**
     * Відключає конкретне підключення клієнта від сервера.
     * @param {Client} client - Об'єкт Client для відключення.
     * @returns {boolean} - True, якщо підключення було відключено.
     */
    disconnectClient(client) {
        if (!this.connectedClients.has(client.id)) {
            this.logger.warn(
                `Attempted to disconnect unknown client connection with ID "${client.id}".`,
            )
            return false
        }

        // Закриваємо реальний WebSocket, якщо він ще відкритий
        if (client.ws && client.ws.readyState === client.ws.OPEN) {
            client.ws.close()
            this.logger.debug(
                `Closed WebSocket for client connection "${client.id}" (User: ${client.userId}).`,
            )
        }

        // Проходимо по всіх неймспейсах і просимо їх видалити це підключення
        this.namespaces.forEach((ns) => {
            ns._removeClient(client)
        })

        // Видаляємо з глобального реєстру підключень
        this.connectedClients.delete(client.id)

        // Видаляємо підключення з реєстру користувачів
        if (this.userConnections.has(client.userId)) {
            this.userConnections.get(client.userId).delete(client)
            if (this.userConnections.get(client.userId).size === 0) {
                this.userConnections.delete(client.userId) // Якщо це було останнє підключення користувача
                this.logger.info(
                    `User "${client.username}" (ID: ${client.userId}) is now completely offline.`,
                )
            }
        }

        this.logger.info(
            `Client connection "${client.id}" for User "${client.username}" (ID: ${client.userId}) disconnected from Server.`,
        )
        return true
    }

    /**
     * Надсилає повідомлення всім підключенням на сервері (у всіх неймспейсах).
     * Аналог `io.emit()`.
     * @param {string} message - Повідомлення.
     * @param {object} [options={}] - Налаштування.
     * @returns {number} - Кількість підключень, яким надіслано повідомлення.
     */
    emit(message, options = {}) {
        const { type = 'info', metadata = {} } = options
        const messagePayload = {
            message,
            type,
            timestamp: new Date().toISOString(),
            serverGlobal: true,
            ...metadata,
        }

        let sentCount = 0
        this.connectedClients.forEach((client) => {
            client.send(messagePayload)
            sentCount++
        })
        this.logger.info(`Global message emitted from Server to ${sentCount} client connections.`)
        return sentCount
    }

    /**
     * Надсилає повідомлення конкретному користувачу (всім його активним підключенням).
     * @param {string} userId - ID користувача.
     * @param {string} message - Повідомлення.
     * @param {object} [options={}] - Налаштування.
     * @returns {number} - Кількість підключень, яким надіслано повідомлення.
     */
    sendToUser(userId, message, options = {}) {
        const userClients = this.userConnections.get(userId)
        if (!userClients || userClients.size === 0) {
            this.logger.warn(
                `Attempted to send message to User ID "${userId}", but no active connections found.`,
            )
            return 0
        }

        const { type = 'info', metadata = {} } = options
        const messagePayload = {
            message,
            type,
            timestamp: new Date().toISOString(),
            targetUserId: userId,
            ...metadata,
        }

        let sentCount = 0
        userClients.forEach((client) => {
            client.send(messagePayload)
            sentCount++
        })
        this.logger.info(`Message sent to User ID "${userId}" across ${sentCount} connections.`)
        return sentCount
    }

    /**
     * Повертає список всіх підключених Client об'єктів до сервера.
     * @returns {Array<Client>}
     */
    getAllConnectedClients() {
        return Array.from(this.connectedClients.values())
    }

    /**
     * Повертає список всіх унікальних ID користувачів, які мають хоча б одне активне підключення.
     * @returns {Array<string>}
     */
    getAllOnlineUserIds() {
        return Array.from(this.userConnections.keys())
    }

    destroy() {
        this.logger.info(
            'Destroying Server. Disconnecting all clients and destroying all namespaces.',
        )
        this.connectedClients.forEach((client) => this.disconnectClient(client)) // Використовуємо disconnectClient для повного очищення
        this.namespaces.forEach((ns) => ns.destroy())
        this.namespaces.clear()
        this.connectedClients.clear()
        this.userConnections.clear()
        this.logger = null // Знищуємо посилання на логер
    }
}

export { Server }
