/**
     * Обробляє вхідні повідомлення від клієнта.
     * @async
     * @param {string} userId - Ідентифікатор користувача.
     * @param {object} message - Вхідне повідомлення від клієнта.
     */
    async handleClientMessage(userId, message) {
        this.#logger.debug(
            `Namespace '${this.#id}': Handling client message from '${userId}':`,
            message,
        )

        switch (message.type) {
            case 'joinRoom':
                const roomToJoin = await this.getOrCreateRoom(message.roomId)
                const added = await roomToJoin.addUser(userId)
                if (added) {
                    await roomToJoin.send('roomJoined', {
                        roomId: message.roomId,
                        namespaceId: this.#id,
                    })
                    await roomToJoin.send(
                        'userJoined',
                        {
                            userId: userId,
                        },
                        {},
                        [userId],
                    )
                }
                break
            case 'leaveRoom':
                const roomToLeave = this.getRoom(message.roomId)
                if (roomToLeave) {
                    const removed = await roomToLeave.removeUser(userId)
                    if (removed) {
                        await roomToLeave.send('roomLeft', {
                            roomId: message.roomId,
                            namespaceId: this.#id,
                        })
                        await roomToLeave.send(
                            'userLeft',
                            {
                                userId: userId,
                            },
                            {},
                            [userId],
                        )
                    }
                }
                break
            case 'roomMessage':
                const targetRoom = this.getRoom(message.roomId)
                if (targetRoom && (await targetRoom.hasUser(userId))) {
                    await targetRoom.send('roomMessage', message.payload)
                } else {
                    this.#logger.warn(
                        `User '${userId}' tried to send message to non-existent or unauthorized room '${
                            message.roomId
                        }' in namespace '${this.#id}'.`,
                    )
                }
                break
            default:
                this.#logger.warn(
                    `Namespace '${this.#id}': Unknown message type '${
                        message.type
                    }' from user '${userId}'.`,
                )
                break
        }
    }
