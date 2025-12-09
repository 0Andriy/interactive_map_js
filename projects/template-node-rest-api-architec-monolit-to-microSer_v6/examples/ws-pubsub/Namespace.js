// src/core/Namespace.js

import { Connection } from './Connection.js'
import { Room } from './Room.js'
import { v4 as uuidv4 } from 'uuid'

export class Namespace {
    /**
     * @param {string} name Ім'я Namespace
     * @param {import('../di/PubSubAdapter.js').PubSubAdapter} pubSubAdapter Адаптер
     * @param {import('../di/Logger.js').Logger} logger Логер
     */
    constructor(name, pubSubAdapter, logger) {
        this.name = name
        this.logger = logger
        this.pubSub = pubSubAdapter

        /** @type {Map<string, Connection>} */
        this.connections = new Map()
        /** @type {Map<string, Room>} */
        this.rooms = new Map()

        this.broadcastChannel = `ns:${this.name}:broadcast`
        this._handleRemoteBroadcastBound = this._handleRemoteBroadcast.bind(this)
        this.pubSub.subscribe(this.broadcastChannel, this._handleRemoteBroadcastBound)

        this.logger.log(`Namespace '${this.name}' initialized.`)
    }

    // --- Керування Підключеннями ---

    /**
     * @param {object} ws Об'єкт ws-бібліотеки
     * @param {string} userId ID користувача
     * @returns {Connection}
     */
    addConnection(ws, userId) {
        const connectionId = uuidv4()
        const conn = new Connection(connectionId, ws, userId)
        this.connections.set(connectionId, conn)

        this.joinRoom(connectionId, 'general')
        this.logger.log(`[${this.name}] Connection added. ID: ${connectionId}, User: ${userId}`)
        return conn
    }

    removeConnection(connectionId) {
        const conn = this.connections.get(connectionId)
        if (conn) {
            conn.rooms.forEach((roomId) => this.leaveRoom(connectionId, roomId, true))
            this.connections.delete(connectionId)
            this.logger.log(`[${this.name}] Connection removed. ID: ${connectionId}`)
        }
    }

    // --- Керування Кімнатами ---

    _getOrCreateRoom(roomId) {
        if (!this.rooms.has(roomId)) {
            const newRoom = new Room(roomId, this.logger)
            this.rooms.set(roomId, newRoom)
        }
        return this.rooms.get(roomId)
    }

    _cleanupRoom(roomId) {
        const room = this.rooms.get(roomId)
        if (room && room.size() === 0) {
            this.rooms.delete(roomId)
            this.logger.log(`[${this.name}] Empty room deleted: ${roomId}`)
        }
    }

    joinRoom(connectionId, roomId) {
        const conn = this.connections.get(connectionId)
        if (!conn) return

        const room = this._getOrCreateRoom(roomId)

        conn.joinRoom(roomId)
        room.addConnection(connectionId)

        this.logger.log(`[${this.name}] Connection ${connectionId} joined room ${roomId}.`)
    }

    leaveRoom(connectionId, roomId, isDisconnect = false) {
        const conn = this.connections.get(connectionId)
        const room = this.rooms.get(roomId)

        if (conn) conn.leaveRoom(roomId)

        if (room) {
            room.removeConnection(connectionId)
            if (isDisconnect || room.size() === 0) {
                this._cleanupRoom(roomId)
            }
        }
    }

    // --- Розсилка Повідомлень (Локальна та Віддалена) ---

    /**
     * Надсилає повідомлення всім у кімнаті.
     */
    async to(roomId, type, payload) {
        const message = {
            targetRoom: roomId,
            type,
            payload,
            origin: process.env.NODE_ID || 'local',
        }

        this._sendLocal(roomId, type, payload)

        await this.pubSub
            .publish(this.broadcastChannel, JSON.stringify(message))
            .catch((e) =>
                this.logger.error(`[${this.name}] Failed to publish message to PubSub`, e),
            )
    }

    _sendLocal(roomId, type, payload) {
        const room = this.rooms.get(roomId)
        if (!room) return

        let sentCount = 0
        const connectionIds = room.getConnections()

        for (const connId of connectionIds) {
            const conn = this.connections.get(connId)
            if (conn) {
                conn.send(type, payload)
                sentCount++
            }
        }
        this.logger.log(`[${this.name}] Local broadcast to room ${roomId}`, {
            connections: sentCount,
        })
    }

    _handleRemoteBroadcast(channel, jsonMessage) {
        try {
            const message = JSON.parse(jsonMessage)
            if (message.origin === (process.env.NODE_ID || 'local')) return

            this.logger.log(
                `[${this.name}] Received remote broadcast for room ${message.targetRoom}`,
            )
            this._sendLocal(message.targetRoom, message.type, message.payload)
        } catch (error) {
            this.logger.error(`[${this.name}] Error parsing remote message`, error)
        }
    }

    // --- Обробка Вхідних Повідомлень ---

    async handleMessage(connectionId, rawMessage) {
        const conn = this.connections.get(connectionId)
        if (!conn) return

        try {
            const { type, data } = JSON.parse(rawMessage)
            this.logger.log(`[${this.name}] Received message from ${conn.userId}`, { type })

            switch (type) {
                case 'message:send':
                    await this.to(data.roomId || 'general', 'message:new', {
                        sender: conn.userId,
                        text: data.text,
                    })
                    break
                case 'room:join':
                    this.joinRoom(connectionId, data.roomId)
                    break
                case 'room:leave':
                    this.leaveRoom(connectionId, data.roomId)
                    break
                // ... інші обробники
            }
        } catch (error) {
            this.logger.error(`[${this.name}] Error processing message from ${conn.userId}`, error)
        }
    }
}
