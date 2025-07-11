// src/core/namespaces/GameNamespace.js
import { Namespace } from '../Namespace.js'

export class GameNamespace extends Namespace {
    constructor(...args) {
        super(...args)
        this.logger.log(`GameNamespace created.`)
    }

    /**
     * @override
     * Обробляє повідомлення, специфічні для простору імен "game".
     */
    async handleClientMessage(userId, message, ws) {
        const handled = await this.handleCommonMessages(userId, message, ws)
        if (handled) {
            return
        }

        switch (message.type) {
            case 'game_move':
                const gameRoom = this.getRoom(message.roomId)
                if (gameRoom && (await gameRoom.hasUser(userId))) {
                    this.logger.log(
                        `[Game] User ${userId} made move ${JSON.stringify(message.move)} in room ${
                            message.roomId
                        }`,
                    )
                    // Валідація ходу, оновлення ігрового стану, збереження ходу
                    await this.publishRoomMessage(message.roomId, userId, {
                        type: 'gameMove',
                        userId: userId,
                        move: message.move,
                    })
                } else {
                    this.logger.warn(
                        `User '${userId}' tried to make a move in non-existent or unauthorized room '${message.roomId}'.`,
                    )
                }
                break

            case 'game_state_request':
                // Логіка для відправки поточного стану гри
                this.logger.log(
                    `[Game] User ${userId} requested game state for room ${message.roomId}`,
                )
                this.wsAdapter.sendMessageToUser(userId, { type: 'game_state', state: {} })
                break

            default:
                this.logger.warn(
                    `[Game] Unknown message type '${message.type}' from user '${userId}'.`,
                )
                break
        }
    }
}
