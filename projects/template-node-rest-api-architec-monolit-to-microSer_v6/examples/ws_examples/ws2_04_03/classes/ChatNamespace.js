import Namespace from './Namespace.js'

/**
 * Клас, що представляє простір імен для чату.
 * Містить специфічну логіку обробки подій чату.
 */
class ChatNamespace extends Namespace {
    constructor(redisClient) {
        super('/chat', redisClient)
        // Можна додати специфічні для чату властивості або залежності
        // this.chatPersistenceService = chatPersistenceService;
    }

    // Перевизначений метод для обробки вхідних повідомлень
    async handleMessage(ws, message) {
        try {
            const data = JSON.parse(message.toString())
            console.log(`[${this.name}] Message from ${ws.username} (${ws.id}):`, data)

            switch (data.type) {
                case 'join_room':
                    const { roomId } = data.payload
                    // Перевірка прав доступу до кімнати (з БД або AuthManager)
                    const isAllowed = true // await checkUserAccessToRoom(ws.userId, roomId);
                    if (isAllowed) {
                        this.joinRoom(ws.id, roomId)
                        ws.send(
                            JSON.stringify({
                                type: 'system',
                                namespace: this.name,
                                message: `You joined room: ${roomId}`,
                            }),
                        )
                        // Повідомляємо інших учасників через Redis про приєднання нового користувача
                        this.publishToNamespace(
                            {
                                type: 'user_joined_room',
                                roomId: roomId,
                                payload: {
                                    userId: ws.userId,
                                    username: ws.username,
                                    socketId: ws.id,
                                },
                            },
                            ws.id,
                        ) // Виключити відправника
                    } else {
                        ws.send(
                            JSON.stringify({
                                type: 'error',
                                message: 'Access denied to this room.',
                            }),
                        )
                    }
                    break

                case 'chat_message':
                    const { roomId: msgRoomId, text } = data.payload
                    // Перевірка, чи сокет є членом цієї кімнати
                    if (!this.rooms.has(msgRoomId) || !this.rooms.get(msgRoomId).has(ws.id)) {
                        return ws.send(
                            JSON.stringify({
                                type: 'error',
                                message: 'Not a member of this chat room.',
                            }),
                        )
                    }

                    const chatMessage = {
                        senderId: ws.userId,
                        senderName: ws.username,
                        text,
                        timestamp: new Date().toISOString(),
                    }

                    // Збереження повідомлення в БД (викликаємо відповідний сервіс)
                    // await this.chatPersistenceService.saveMessage(chatMessage);
                    console.log('Saving chat message to DB (mock):', chatMessage)

                    // Публікація в Redis для розсилки всім інстансам цього namespace в цій кімнаті
                    this.publishToNamespace({
                        type: 'chat_message',
                        roomId: msgRoomId, // Важливо, щоб broadcast знав, до якої кімнати надсилати
                        payload: chatMessage,
                    })
                    break

                case 'typing_indicator':
                    const { roomId: typingRoomId } = data.payload
                    if (this.rooms.has(typingRoomId) && this.rooms.get(typingRoomId).has(ws.id)) {
                        this.publishToNamespace(
                            {
                                type: 'typing_indicator',
                                roomId: typingRoomId,
                                payload: {
                                    userId: ws.userId,
                                    username: ws.username,
                                    socketId: ws.id,
                                },
                            },
                            ws.id,
                        ) // Виключити відправника
                    }
                    break

                default:
                    ws.send(
                        JSON.stringify({ type: 'error', message: 'Unknown chat message type.' }),
                    )
            }
        } catch (error) {
            console.error(`[${this.name}] Error parsing message from ${ws.id}:`, error)
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format.' }))
        }
    }
}

export default ChatNamespace
