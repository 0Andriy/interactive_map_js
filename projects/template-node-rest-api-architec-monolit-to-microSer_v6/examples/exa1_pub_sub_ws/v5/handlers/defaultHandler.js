/**
 * Внутрішній метод для створення та повернення дефолтного обробника подій.
 * Винесено в окремий метод для чистоти та можливості перевизначення.
 * @private
 * @returns {function({type: string, payload: any, client: ConnectedClient, namespace: Namespace}): Promise<void>}
 */
#createDefaultEventHandler() {
    return async ({ type, payload, client, namespace }) => {
        this.#logger.debug(`[Namespace:${this.#name}] Handling default event type: ${type}`, {
            type,
            payload,
            clientId: client.connectionId,
        });

        switch (type) {
            case 'PING':
                // Клієнт надіслав свій власний PING як JSON повідомлення
                client.send({ type: 'PONG', payload: payload }); // Відповідаємо PONG з тим самим пейлоадом
                this.#logger.debug(`[Namespace:${this.#name}] Responded to client-initiated PING from ${client.connectionId}.`, { clientId: client.connectionId, payload });
                break;

            case 'JOIN_ROOM':
                if (!payload || typeof payload.roomName !== 'string') {
                    client.send({
                        type: 'ERROR',
                        payload: 'JOIN_ROOM: Missing or invalid roomName.',
                    });
                    this.#logger.warn(`[Namespace:${this.#name}] Client ${client.connectionId} sent invalid JOIN_ROOM payload.`, {
                        payload, clientId: client.connectionId
                    });
                    return;
                }
                try {
                    const roomName = payload.roomName;
                    let room = this.#rooms.get(roomName);
                    if (!room) {
                        room = this.#createRoom(roomName); // Створюємо кімнату, якщо її немає
                        this.#logger.info(`[Namespace:${this.#name}] Created new room: '${roomName}'.`, { roomName });
                    }
                    await room.addClient(client);
                    client.send({
                        type: 'JOINED_ROOM',
                        payload: { roomName: room.name, namespace: this.#name },
                    });
                    // Повідомляємо інших клієнтів у кімнаті
                    room.broadcast(
                        {
                            type: 'USER_JOINED',
                            payload: {
                                userId: client.userId,
                                connectionId: client.connectionId,
                                roomName: room.name,
                            },
                        },
                        [client.connectionId], // Виключаємо самого клієнта
                    );
                    this.#logger.info(`[Namespace:${this.#name}] Client ${client.connectionId} (User:${client.userId}) joined room '${roomName}'.`, {
                        clientId: client.connectionId, userId: client.userId, roomName
                    });
                } catch (error) {
                    this.#logger.error(`[Namespace:${this.#name}] Error joining client ${client.connectionId} to room: ${error.message}`, {
                        clientId: client.connectionId, error: error.message, stack: error.stack
                    });
                    client.send({ type: 'ERROR', payload: `Failed to join room: ${error.message}` });
                }
                break;

            case 'LEAVE_ROOM':
                if (!payload || typeof payload.roomName !== 'string') {
                    client.send({
                        type: 'ERROR',
                        payload: 'LEAVE_ROOM: Missing or invalid roomName.',
                    });
                    this.#logger.warn(`[Namespace:${this.#name}] Client ${client.connectionId} sent invalid LEAVE_ROOM payload.`, {
                        payload, clientId: client.connectionId
                    });
                    return;
                }
                try {
                    const roomName = payload.roomName;
                    const room = this.#rooms.get(roomName);
                    if (room && room.hasClient(client.connectionId)) {
                        room.removeClient(client.connectionId);
                        client.send({
                            type: 'LEFT_ROOM',
                            payload: { roomName: room.name, namespace: this.#name },
                        });
                            // Повідомляємо інших клієнтів у кімнаті
                        room.broadcast(
                            {
                                type: 'USER_LEFT',
                                payload: {
                                    userId: client.userId,
                                    connectionId: client.connectionId,
                                    roomName: room.name,
                                },
                            },
                            [], // Надсилаємо всім, бо клієнт вже видалений з кімнати
                        );
                        this.#logger.info(`[Namespace:${this.#name}] Client ${client.connectionId} (User:${client.userId}) left room '${roomName}'.`, {
                            clientId: client.connectionId, userId: client.userId, roomName
                        });
                    } else {
                        client.send({
                            type: 'ERROR',
                            payload: `LEAVE_ROOM: Not in room '${roomName}' or room does not exist.`,
                        });
                        this.#logger.warn(`[Namespace:${this.#name}] Client ${client.connectionId} tried to leave non-existent or unjoined room '${roomName}'.`, {
                            clientId: client.connectionId, roomName
                        });
                    }
                } catch (error) {
                    this.#logger.error(`[Namespace:${this.#name}] Error leaving client ${client.connectionId} from room: ${error.message}`, {
                        clientId: client.connectionId, error: error.message, stack: error.stack
                    });
                    client.send({ type: 'ERROR', payload: `Failed to leave room: ${error.message}` });
                }
                break;

            case 'CHAT_MESSAGE':
                if (!payload || typeof payload.roomName !== 'string' || typeof payload.message !== 'string') {
                    client.send({
                        type: 'ERROR',
                        payload: 'CHAT_MESSAGE: Missing or invalid roomName or message.',
                    });
                    this.#logger.warn(`[Namespace:${this.#name}] Client ${client.connectionId} sent invalid CHAT_MESSAGE payload.`, {
                        payload, clientId: client.connectionId
                    });
                    return;
                }
                try {
                    const roomName = payload.roomName;
                    const message = payload.message;
                    const room = this.#rooms.get(roomName);
                    if (room && room.hasClient(client.connectionId)) {
                        const chatPayload = {
                            userId: client.userId,
                            message: message,
                            timestamp: Date.now(),
                            roomName: room.name,
                        };
                        room.broadcast({ type: 'NEW_CHAT_MESSAGE', payload: chatPayload });
                        this.#logger.debug(`[Namespace:${this.#name}] Chat message from ${client.userId} in room '${roomName}': '${message}'.`, {
                            userId: client.userId, roomName, message
                        });
                    } else {
                        client.send({
                            type: 'ERROR',
                            payload: `CHAT_MESSAGE: Not in room '${roomName}' or room does not exist.`,
                        });
                        this.#logger.warn(`[Namespace:${this.#name}] Client ${client.connectionId} tried to send chat message to non-existent or unjoined room '${roomName}'.`, {
                            clientId: client.connectionId, roomName
                        });
                    }
                } catch (error) {
                    this.#logger.error(`[Namespace:${this.#name}] Error sending chat message from client ${client.connectionId}: ${error.message}`, {
                        clientId: client.connectionId, error: error.message, stack: error.stack
                    });
                    client.send({ type: 'ERROR', payload: `Failed to send message: ${error.message}` });
                }
                break;

            case 'LIST_ROOMS':
                const roomsInfo = Array.from(this.#rooms.values()).map((room) => ({
                    name: room.name,
                    clientsCount: room.totalClients,
                }));
                client.send({ type: 'ROOMS_LIST', payload: roomsInfo });
                this.#logger.debug(`[Namespace:${this.#name}] Sent rooms list to client ${client.connectionId}.`, {
                    clientId: client.connectionId, roomsCount: roomsInfo.length
                });
                break;

            case 'WHO_AM_I':
                client.send({
                    type: 'YOUR_INFO',
                    payload: {
                        connectionId: client.connectionId,
                        userId: client.userId,
                        namespace: this.#name,
                        rooms: Array.from(client.rooms).map(roomFullName => roomFullName.split('/')[1]), // Тільки назви кімнат у поточному Namespace
                    },
                });
                this.#logger.debug(`[Namespace:${this.#name}] Sent client info to client ${client.connectionId}.`, {
                    clientId: client.connectionId, userId: client.userId
                });
                break;

            default:
                this.#logger.warn(`[Namespace:${this.#name}] Unhandled event type: ${type} from client ${client.connectionId}.`, {
                    type, payload, clientId: client.connectionId
                });
                client.send({ type: 'ERROR', payload: `Unknown event type: ${type}.` });
                break;
        }
    };
}
