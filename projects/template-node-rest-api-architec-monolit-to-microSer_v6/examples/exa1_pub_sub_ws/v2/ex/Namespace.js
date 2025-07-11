// src/core/Namespace.js
// ... (імпорти без змін)

class Namespace {
    // ... (приватні поля без змін)

    // ... (конструктор та геттери без змін)

    // ... (методи getRoom, getOrCreateRoom, destroyRoom, publishRoomMessage, #setupPubSubListeners, #loadRoomsFromStorage без змін)

    // ... (addGlobalScheduledTask без змін)

    /**
     * Обробляє спільні для всіх просторів імен типи повідомлень.
     * @param {string} userId - ID користувача.
     * @param {object} message - Вхідне повідомлення.
     * @param {WebSocket} ws - WebSocket з'єднання.
     * @returns {boolean} - True, якщо повідомлення було оброблено, інакше false.
     */
    async handleCommonMessages(userId, message, ws) {
        switch (message.type) {
            case 'joinRoom':
                const roomToJoin = await this.getOrCreateRoom(message.roomId)
                const added = await roomToJoin.addUser(userId)
                if (added) {
                    this.wsAdapter.sendMessageToUser(userId, {
                        type: 'roomJoined',
                        roomId: message.roomId,
                        namespaceId: this.id,
                    })
                    await this.publishRoomMessage(message.roomId, userId, {
                        status: 'userJoined',
                        userId: userId,
                    })
                }
                return true
            case 'leaveRoom':
                const roomToLeave = this.getRoom(message.roomId)
                if (roomToLeave) {
                    const removed = await roomToLeave.removeUser(userId)
                    if (removed) {
                        this.wsAdapter.sendMessageToUser(userId, {
                            type: 'roomLeft',
                            roomId: message.roomId,
                            namespaceId: this.id,
                        })
                        await this.publishRoomMessage(message.roomId, userId, {
                            status: 'userLeft',
                            userId: userId,
                        })
                    }
                }
                return true
            case 'roomMessage':
                const targetRoom = this.getRoom(message.roomId)
                if (targetRoom && (await targetRoom.hasUser(userId))) {
                    await this.publishRoomMessage(message.roomId, userId, message.payload)
                } else {
                    this.logger.warn(
                        `User '${userId}' tried to send message to non-existent or unauthorized room '${message.roomId}' in namespace '${this.id}'.`,
                    )
                }
                return true
            default:
                return false
        }
    }

    /**
     * Цей метод буде перевизначений у підкласах.
     * Базова реалізація може просто обробляти лише спільні повідомлення.
     */
    async handleClientMessage(userId, message, ws) {
        this.logger.debug(
            `Namespace '${this.id}': Handling client message from '${userId}':`,
            message,
        )
        await this.handleCommonMessages(userId, message, ws)
    }

    // ... (метод destroy без змін)
}

export { Namespace }
