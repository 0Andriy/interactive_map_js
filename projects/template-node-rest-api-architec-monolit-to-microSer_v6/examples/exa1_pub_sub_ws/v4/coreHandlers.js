// coreHandlers.js

import { createLogger } from './logger.js'

const logger = createLogger('CoreHandlers')

/**
 * Централізовані обробники для загальної логіки WebSocket подій,
 * таких як приєднання/вихід з кімнати, надсилання повідомлень.
 * Ці обробники можуть бути викликані з defaultHandler або customHandler
 * будь-якого Namespace.
 */
export const coreHandlers = {
    /**
     * Обробляє подію приєднання клієнта до кімнати.
     * @param {object} context - Контекст події (type, payload, client, namespace).
     * @returns {boolean} - true, якщо подія оброблена, false інакше.
     */
    handleJoinRoom: (context) => {
        const { payload, client, namespace } = context
        const roomName = payload.room

        if (!client.userId) {
            client.send({
                type: 'ERROR',
                payload: 'AUTH_REQUIRED: You must be authenticated to join rooms.',
            })
            return true // Оброблене (відмовлено)
        }
        if (!roomName) {
            client.send({ type: 'ERROR', payload: 'JOIN_ROOM_ERROR: Room name required.' })
            return true // Оброблене (відмовлено)
        }

        const room = namespace.getOrCreateRoom(roomName)
        if (room.hasClient(client.connectionId)) {
            client.send({ type: 'INFO', payload: `You are already in room '${roomName}'.` })
            logger.debug(`[CoreHandlers] Client ${client.userId} already in room ${roomName}.`)
            return true // Оброблене
        }

        room.addClient(client)
        client.send({ type: 'ROOM_JOINED', room: roomName, namespace: namespace.name })
        room.send(
            {
                type: 'SYSTEM_MESSAGE',
                text: `${client.userId} joined ${roomName} in ${namespace.name}.`,
            },
            [client.connectionId],
        ) // Сповістити всіх, крім того, хто приєднався

        logger.info(
            `[CoreHandlers] Client ${client.userId} joined room '${roomName}' in namespace '${namespace.name}'.`,
        )
        return true
    },

    /**
     * Обробляє подію виходу клієнта з кімнати.
     * @param {object} context - Контекст події (type, payload, client, namespace).
     * @returns {boolean} - true, якщо подія оброблена, false інакше.
     */
    handleLeaveRoom: (context) => {
        const { payload, client, namespace } = context
        const roomName = payload.room

        if (!client.userId) {
            client.send({
                type: 'ERROR',
                payload: 'AUTH_REQUIRED: You must be authenticated to leave rooms.',
            })
            return true
        }
        if (!roomName) {
            client.send({ type: 'ERROR', payload: 'LEAVE_ROOM_ERROR: Room name required.' })
            return true
        }

        const room = namespace.getRoom(roomName) // Використовуємо getRoom, а не getOrCreateRoom
        if (!room) {
            client.send({
                type: 'ERROR',
                payload: `LEAVE_ROOM_ERROR: Room '${roomName}' not found.`,
            })
            logger.warn(
                `[CoreHandlers] Client ${client.userId} tried to leave non-existent room '${roomName}'.`,
            )
            return true
        }

        if (!room.hasClient(client.connectionId)) {
            client.send({ type: 'INFO', payload: `You are not in room '${roomName}'.` })
            logger.debug(`[CoreHandlers] Client ${client.userId} not in room ${roomName}.`)
            return true
        }

        room.removeClient(client.connectionId)
        client.send({ type: 'ROOM_LEFT', room: roomName, namespace: namespace.name })
        room.send({
            type: 'SYSTEM_MESSAGE',
            text: `${client.userId} left ${roomName} in ${namespace.name}.`,
        }) // Сповістити всіх, хто залишився

        logger.info(
            `[CoreHandlers] Client ${client.userId} left room '${roomName}' in namespace '${namespace.name}'.`,
        )
        return true
    },

    /**
     * Обробляє подію надсилання повідомлення в кімнату.
     * @param {object} context - Контекст події (type, payload, client, namespace).
     * @param {string} defaultRoomName - Ім'я кімнати за замовчуванням, якщо payload.room відсутній.
     * @returns {boolean} - true, якщо подія оброблена, false інакше.
     */
    handleChatMessage: (context, defaultRoomName = 'general') => {
        const { payload, client, namespace } = context
        const roomName = payload.room || defaultRoomName
        const messageText = payload.text

        if (!client.userId) {
            client.send({
                type: 'ERROR',
                payload: 'AUTH_REQUIRED: You must be authenticated to send chat messages.',
            })
            return true
        }
        if (!messageText) {
            client.send({
                type: 'ERROR',
                payload: 'CHAT_MESSAGE_ERROR: Message text cannot be empty.',
            })
            return true
        }

        const room = namespace.getRoom(roomName)
        if (!room || !room.hasClient(client.connectionId)) {
            client.send({
                type: 'ERROR',
                payload: `CHAT_MESSAGE_ERROR: You are not in room '${roomName}'. Please join it first.`,
            })
            logger.warn(
                `[CoreHandlers] Client ${client.userId} tried to send message to room '${roomName}' without being in it.`,
            )
            return true
        }

        const message = {
            type: 'CHAT_MESSAGE',
            user: client.userId,
            text: messageText,
            timestamp: new Date().toISOString(),
        }
        room.send(message, [], { binary: false }) // Надсилаємо всім у кімнаті
        client.send({ type: 'ACK', originalType: 'CHAT_MESSAGE', room: roomName }) // Підтвердження відправнику

        logger.debug(
            `[CoreHandlers] Client ${
                client.userId
            } sent message to room '${roomName}': '${messageText.substring(0, 50)}...'`,
        )
        return true
    },
}
