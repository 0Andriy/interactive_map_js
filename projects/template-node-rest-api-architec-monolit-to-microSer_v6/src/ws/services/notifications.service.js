// src/websockets/services/notification.service.js (namespace)

/**
 * @file Обробник логіки для WebSocket неймспейсу сповіщень (`/ws/notifications`).
 * Цей неймспейс призначений для надсилання персональних сповіщень користувачам.
 * Експортує також функцію `sendUserNotification` для використання з REST API або інших частин бекенду.
 */

import { roomManager } from '../index.js' // Імпортуємо RoomManager

/**
 * Унікальний префікс для всіх персональних кімнат сповіщень.
 * @type {string}
 * @constant
 */
const NOTIFICATION_ROOM_PREFIX = 'notification:user:'

/**
 * Генерує повну унікальну назву кімнати сповіщень для конкретного користувача.
 * @param {string} userId - Унікальний ідентифікатор користувача.
 * @returns {string} Повна назва кімнати сповіщень (наприклад, 'notification:user:userID123').
 */
const getUserNotificationRoomName = (userId) => `${NOTIFICATION_ROOM_PREFIX}${userId}`

/**
 * Обробник підключення нового клієнта до неймспейсу сповіщень.
 * Кожен користувач приєднується до своєї унікальної "кімнати" сповіщень на основі його `userId`.
 * @param {import('../RoomManager.js').CustomWebSocket} ws - Об'єкт WebSocket клієнта.
 */
const handleNotificationsConnection = async (ws) => {
    // Кожен користувач має свою "кімнату" для сповіщень
    const userNotificationRoom = getUserNotificationRoomName(ws.userId)
    roomManager.logger.info(
        `[Notifications Namespace] Client ${
            ws.username || ws.userId
        } connected for notifications (room: ${userNotificationRoom}).`,
    )

    // Приєднуємо клієнта до його персональної кімнати сповіщень.
    // Для сповіщень callback та інтервал оновлення зазвичай не потрібні, оскільки вони надсилаються за запитом.
    await roomManager.joinRoom(userNotificationRoom, ws)

    ws.send(
        JSON.stringify({
            type: 'NOTIFICATION_WELCOME',
            message: `Welcome, ${ws.username}! You will receive notifications here.`,
        }),
    )
}

/**
 * Обробник повідомлення від клієнта в неймспейсі сповіщень.
 * Зазвичай клієнти не надсилають повідомлень у неймспейс сповіщень, а лише отримують їх.
 * @param {import('../RoomManager.js').CustomWebSocket} ws - Об'єкт WebSocket клієнта.
 * @param {string | Buffer} message - Отримане повідомлення.
 */
const handleNotificationsMessage = async (ws, message) => {
    roomManager.logger.warn(
        `[Notifications Namespace] Client ${
            ws.username
        } sent an unexpected message: ${message.toString()}`,
    )
    ws.send(
        JSON.stringify({ type: 'ERROR', message: 'This is a receive-only notification channel.' }),
    )
}

/**
 * Обробник відключення клієнта від неймспейсу сповіщень.
 * @param {import('../RoomManager.js').CustomWebSocket} ws - Об'єкт WebSocket клієнта.
 */
const handleNotificationsClose = async (ws) => {
    roomManager.logger.info(
        `[Notifications Namespace] Client ${
            ws.username || ws.userId
        } disconnected from notifications.`,
    )
    // RoomManager's `__closeHandlerRegistered` mechanism handles the global cleanup from rooms.
}

/**
 * Метод для надсилання сповіщення конкретному користувачу.
 * Цей метод може бути викликаний з будь-якого місця в вашому додатку (наприклад, з Express REST API).
 * Повідомлення буде опубліковано в Redis Pub/Sub на канал відповідної кімнати користувача.
 * @param {string} userId - ID користувача, якому потрібно надіслати сповіщення.
 * @param {object} notificationPayload - Об'єкт сповіщення (наприклад, { type: 'INFO', text: 'Ваше повідомлення' }).
 * @returns {Promise<number>} Кількість підписників (тобто WebSocket клієнтів), які отримали повідомлення на всіх інстансах.
 */
export const sendUserNotification = async (userId, notificationPayload) => {
    // Формуємо унікальну назву кімнати з префіксом для конкретного користувача
    const roomName = getUserNotificationRoomName(userId)
    roomManager.logger.debug(
        `[Notifications Namespace] Attempting to send notification to user ${userId} in room '${roomName}':`,
        notificationPayload,
    )
    // Використовуємо `sendMessageToRoom` для публікації в Redis.
    return await roomManager.sendMessageToRoom(roomName, {
        type: 'NEW_NOTIFICATION',
        ...notificationPayload,
        timestamp: Date.now(),
    })
}

export default {
    handleConnection: handleNotificationsConnection,
    handleMessage: handleNotificationsMessage,
    handleClose: handleNotificationsClose,
    sendUserNotification, // Експортуємо функцію, щоб її можна було використовувати ззовні (наприклад, з Express)
}
