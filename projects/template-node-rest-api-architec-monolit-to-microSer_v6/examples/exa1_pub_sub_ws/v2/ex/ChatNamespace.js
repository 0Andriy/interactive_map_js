// src/core/namespaces/ChatNamespace.js
import { Namespace } from '../Namespace.js'

export class ChatNamespace extends Namespace {
    constructor(...args) {
        super(...args)
        this.logger.log(`ChatNamespace created.`)
    }

    /**
     * @override
     * Обробляє повідомлення, специфічні для простору імен "chat".
     */
    async handleClientMessage(userId, message, ws) {
        // Спочатку обробляємо спільні повідомлення
        const handled = await this.handleCommonMessages(userId, message, ws)
        if (handled) {
            return
        }

        // Потім обробляємо специфічні для чату повідомлення
        switch (message.type) {
            case 'chat_message':
                const chatRoom = this.getRoom(message.roomId)
                if (chatRoom && (await chatRoom.hasUser(userId))) {
                    this.logger.log(
                        `[Chat] User ${userId} sent: ${message.text} in room ${message.roomId}`,
                    )
                    // Тут може бути додаткова логіка, як-от модерація, фільтрація слів, збереження історії
                    await this.publishRoomMessage(message.roomId, userId, {
                        text: message.text,
                        type: 'chatMessage',
                        from: userId,
                    })
                } else {
                    this.logger.warn(
                        `User '${userId}' tried to send message to non-existent or unauthorized room '${message.roomId}'.`,
                    )
                }
                break

            case 'get_history':
                // Логіка для отримання історії чату з бази даних
                this.logger.log(
                    `[Chat] User ${userId} requested chat history for room ${message.roomId}`,
                )
                // Відправка історії користувачу
                this.wsAdapter.sendMessageToUser(userId, { type: 'chat_history', history: [] })
                break

            default:
                this.logger.warn(
                    `[Chat] Unknown message type '${message.type}' from user '${userId}'.`,
                )
                break
        }
    }
}
