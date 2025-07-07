// src/Client.js

import { EventEmitter } from 'events'
import UIDGenerator from './utils/UIDGenerator.js'
import { logger } from './utils/logger.js'

class Client extends EventEmitter {
    constructor(ws, request) {
        super()
        this.id = UIDGenerator.generate()
        this.ws = ws
        this.request = request
        this.namespace = null // Посилання на простір імен, до якого належить клієнт
        this.rooms = new Set() // Кімнати, до яких приєднався клієнт
        this.logger = logger
        this.user = null // Інформація про автентифікованого користувача (userId, roles тощо)

        this._setupWebSocketListeners()
    }

    _setupWebSocketListeners() {
        this.ws.on('message', (message) => {
            try {
                // Вхідні повідомлення очікуються у форматі JSON
                const parsedMessage = JSON.parse(message)
                this.emit('message', parsedMessage)
            } catch (error) {
                this.logger.warn(
                    `[Client ${this.id}] Received malformed message:`,
                    message.toString(),
                    error,
                )
            }
        })

        this.ws.on('close', (code, reason) => {
            this.emit('disconnect', code, reason)
        })

        this.ws.on('error', (error) => {
            this.emit('error', error)
            this.logger.error(`[Client ${this.id}] WebSocket error:`, error)
        })
    }

    /**
     * Надсилає повідомлення клієнту.
     * @param {string} eventName - Назва події.
     * @param {object} payload - Об'єкт даних для відправки.
     */
    send(eventName, payload) {
        if (this.ws.readyState === this.ws.OPEN) {
            try {
                this.ws.send(JSON.stringify({ event: eventName, data: payload }))
            } catch (error) {
                this.logger.error(`[Client ${this.id}] Failed to send message:`, error)
            }
        }
    }

    /**
     * Додає клієнта до вказаної кімнати.
     * @param {string} roomId - ID кімнати.
     */
    join(roomId) {
        this.rooms.add(roomId)
    }

    /**
     * Видаляє клієнта з вказаної кімнати.
     * @param {string} roomId - ID кімнати.
     */
    leave(roomId) {
        this.rooms.delete(roomId)
    }

    /**
     * Перевіряє, чи знаходиться клієнт у вказаній кімнаті.
     * @param {string} roomId - ID кімнати.
     * @returns {boolean}
     */
    isInRoom(roomId) {
        return this.rooms.has(roomId)
    }
}

export default Client
