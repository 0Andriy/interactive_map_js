/**
 * @file Клас для управління колекцією з'єднань в одній логічній кімнаті.
 */

import WebSocketConnection from './WebSocketConnection.js'

/**
 * Представляє окрему кімнату (chat:general, game:lobby_1),
 * яка містить набір унікальних ідентифікаторів з'єднань, що до неї підписані.
 */
class WebSocketRoom {
    /**
     * @type {string} Повна назва кімнати (наприклад, 'chat::general').
     */
    name

    /**
     * @private
     * @type {Set<string>} Набір ID з'єднань, які є учасниками цієї кімнати.
     */
    #connections = new Set()

    /**
     * @private
     * @type {Map<string, WebSocketConnection>} Посилання на всі активні з'єднання в системі.
     */
    #allConnections

    /**
     * @private
     * @type {object | null} Приватний логер.
     */
    #logger = null

    /**
     * Створює екземпляр WebSocketRoom.
     * @param {string} name - Унікальне ім'я кімнати.
     * @param {Map<string, WebSocketConnection>} allConnections - Глобальна мапа активних з'єднань (необхідна для broadcast).
     * @param {object} [logger=null] - Опціональний об'єкт логера.
     */
    constructor(name, allConnections, logger = null) {
        this.name = name
        // Зберігаємо посилання на глобальну мапу
        this.#allConnections = allConnections
        this.#logger = logger
        this.#logger?.debug(`Room ${this.name} created.`)
    }

    /**
     * Додає з'єднання до кімнати.
     * @param {string} connectionId - ID з'єднання.
     */
    addConnection(connectionId) {
        if (this.#connections.add(connectionId)) {
            this.#logger?.trace(`Connection ${connectionId} joined room ${this.name}.`)
        }
    }

    /**
     * Видаляє з'єднання з кімнати.
     * @param {string} connectionId - ID з'єднання.
     */
    removeConnection(connectionId) {
        if (this.#connections.delete(connectionId)) {
            this.#logger?.trace(`Connection ${connectionId} left room ${this.name}.`)
        }
    }

    /**
     * Перевіряє, чи присутнє з'єднання в кімнаті.
     * @param {string} connectionId - ID з'єднання.
     * @returns {boolean}
     */
    hasConnection(connectionId) {
        return this.#connections.has(connectionId)
    }

    /**
     * Повертає кількість учасників у кімнаті.
     * @returns {number}
     */
    get size() {
        return this.#connections.size
    }

    /**
     * Повертає ітератор по всіх ID з'єднань у кімнаті.
     * @returns {IterableIterator<string>}
     */
    getConnections() {
        return this.#connections.values()
    }

    /**
     * Транслює повідомлення всім клієнтам у цій кімнаті.
     * @param {*} data - Дані для відправки (JSON-рядок або Buffer).
     * @param {object} [options={}] - Додаткові опції для методу send.
     * @param {string[] | string | null} [excludeConnectionIds=null] - ID з'єднань, які потрібно виключити з розсилки.
     */
    broadcast(data, options = {}, excludeConnectionIds = null) {
        const excludes = new Set(
            Array.isArray(excludeConnectionIds)
                ? excludeConnectionIds
                : excludeConnectionIds
                ? [excludeConnectionIds]
                : [],
        )
        let recipientsCount = 0

        for (const connectionId of this.#connections) {
            if (excludes.has(connectionId)) {
                continue
            }

            const connection = this.#allConnections.get(connectionId)

            if (connection) {
                try {
                    connection.send(data, options)
                    recipientsCount++
                } catch (error) {
                    this.#logger?.error(
                        `Failed to broadcast to ${connectionId} in room ${this.name}:`,
                        error,
                    )
                }
            }
        }
        this.#logger?.debug(
            `Broadcasted message to ${recipientsCount} recipients in room ${this.name}.`,
        )
    }
}

export default WebSocketRoom
