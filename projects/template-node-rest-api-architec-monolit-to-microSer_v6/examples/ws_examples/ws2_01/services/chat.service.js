// src/websockets/services/chat.service.js  (namespace)
import { publishMessage } from '../pubsub.js'
// import { getChatRoomMessages, saveChatMessage } from '../../database/repositories/chatRepository.js'; // Якщо є репозиторій для чату

/**
 * Обробляє нове WebSocket-з'єднання для чату.
 * @param {import('ws').WebSocket} ws - Об'єкт WebSocket з'єднання.
 * @param {import('http').IncomingMessage} request - Об'єкт HTTP запиту (з нього можна отримати URL, заголовки).
 */
export const handleChatConnection = (ws, request) => {
    // Тут можна виконати автентифікацію користувача, використовуючи токен з URL або заголовків
    // const urlParams = new URL(request.url, `http://${request.headers.host}`).searchParams;
    // const token = urlParams.get('token');
    // const user = authenticateWsToken(token); // Ваша функція автентифікації
    // if (!user) {
    //   ws.close(1008, 'Unauthorized'); // Код 1008: Policy Violation
    //   return;
    // }
    // ws.userId = user.id; // Додаємо ID користувача до об'єкта з'єднання

    console.log('Chat client connected. Ready for messages.')

    ws.on('message', async (message) => {
        try {
            const parsedMessage = JSON.parse(message)
            // Припустимо, повідомлення чату мають вигляд { type: "MESSAGE", content: "..." }
            if (parsedMessage.type === 'MESSAGE') {
                const chatContent = parsedMessage.content
                console.log(`Received chat message from client: "${chatContent}"`)

                // Тут може бути логіка збереження повідомлення в БД
                // await saveChatMessage(ws.userId, chatContent);

                // Публікуємо повідомлення через Redis Pub/Sub для розсилки всім іншим інстансам WS
                // і всім клієнтам, підключеним до будь-якого з інстансів.
                await publishMessage('chat_messages_channel', {
                    type: 'CHAT_MESSAGE',
                    sender: ws.userId || 'Guest', // Використовуємо userId, якщо автентифіковано
                    content: chatContent,
                    timestamp: new Date().toISOString(),
                })
            } else {
                console.warn('Unknown message type received in chat service:', parsedMessage.type)
            }
        } catch (error) {
            console.error('Error processing chat message:', error)
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Failed to process message' }))
        }
    })

    ws.on('close', () => {
        console.log('Chat client disconnected.')
    })

    ws.on('error', (error) => {
        console.error('Chat WebSocket error:', error)
    })
}
