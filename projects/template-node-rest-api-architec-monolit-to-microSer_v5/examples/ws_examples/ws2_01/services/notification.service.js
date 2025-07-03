// src/websockets/services/notificationService.js
// import { getUserNotifications } from '../../database/repositories/notificationRepository.js';

/**
 * Обробляє нове WebSocket-з'єднання для сповіщень.
 * @param {import('ws').WebSocket} ws - Об'єкт WebSocket з'єднання.
 * @param {import('http').IncomingMessage} request - Об'єкт HTTP запиту.
 */
export const handleNotificationConnection = (ws, request) => {
    // Автентифікація користувача для сповіщень
    // const userId = authenticateAndGetUserId(request);
    // if (!userId) {
    //   ws.close(1008, 'Unauthorized for notifications');
    //   return;
    // }
    // ws.userId = userId;

    console.log('Notification client connected. Ready for subscriptions.')

    // Надіслати користувачу останні непрочитані сповіщення при підключенні
    // sendInitialNotifications(ws.userId, ws);

    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message)
            if (parsedMessage.type === 'SUBSCRIBE_TO_USER_NOTIFICATIONS') {
                console.log(`Client ${ws.userId || 'Guest'} subscribed to notifications.`)
                // Зберігаємо, що цей клієнт хоче отримувати сповіщення
                // (наприклад, додаємо ws до внутрішньої мапи активних підписок)
            } else if (parsedMessage.type === 'ACK_NOTIFICATION') {
                // Клієнт підтвердив отримання сповіщення, можна позначити його як прочитане в БД
                // updateNotificationAsRead(ws.userId, parsedMessage.notificationId);
            }
        } catch (error) {
            console.error('Error processing notification message:', error)
        }
    })

    ws.on('close', () => {
        console.log('Notification client disconnected.')
    })

    ws.on('error', (error) => {
        console.error('Notification WebSocket error:', error)
    })
}

// Функція для надсилання нового сповіщення конкретному користувачу
// Ця функція викликатиметься з `pubsub.js` або з інших сервісів
export const sendNotificationToUser = (userId, notificationData) => {
    // Отримати інстанс WSS для сповіщень
    // const notificationWss = getNotificationWss(); // Отримуємо з експорту index.js
    // if (notificationWss) {
    //   notificationWss.clients.forEach(client => {
    //     if (client.readyState === 1 && client.userId === userId) {
    //       client.send(JSON.stringify({ type: 'NEW_NOTIFICATION', payload: notificationData }));
    //     }
    //   });
    // }
}
