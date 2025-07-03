/**
 * @file Обробник логіки для WebSocket неймспейсу чату (`/ws/chat`).
 * Керує підключеннями, повідомленнями та відключеннями клієнтів чату,
 * використовуючи RoomManager для управління кімнатами та міжсерверною комунікацією.
 */

import { roomManager } from '../index.js' // Імпортуємо RoomManager

/**
 * Унікальний префікс для всіх кімнат, керованих цим неймспейсом чату.
 * Це забезпечує ізоляцію назв кімнат від інших неймспейсів.
 * @type {string}
 * @constant
 */
const CHAT_ROOM_PREFIX = 'chat:'

/**
 * Генерує повну унікальну назву кімнати для чату, використовуючи префікс.
 * @param {string} baseName - Базова назва кімнати (наприклад, 'main_lobby').
 * @returns {string} Повна назва кімнати (наприклад, 'chat:main_lobby').
 */
const getChatRoomName = (baseName) => `${CHAT_ROOM_PREFIX}${baseName}`

/**
 * Назва основної (загальнодоступної) кімнати чату.
 * @type {string}
 * @constant
 */
const MAIN_CHAT_ROOM = getChatRoomName('main_lobby')

/**
 * Обробник підключення нового клієнта до неймспейсу чату.
 * Приєднує клієнта до основної кімнати чату та надсилає вітальне повідомлення.
 * @param {import('../RoomManager.js').CustomWebSocket} ws - Об'єкт WebSocket клієнта.
 */
const handleChatConnection = async (ws) => {
    roomManager.logger.info(`[Chat Namespace] Client ${ws.username || ws.userId} connected.`)

    // Автоматично приєднуємо клієнта до основної кімнати при підключенні
    // Клієнт також може пізніше надіслати повідомлення 'JOIN_ROOM' для інших кімнат
    await roomManager.joinRoom(
        MAIN_CHAT_ROOM,
        ws,
        async () => {
            ws.send(
                JSON.stringify({
                    type: 'CHAT_USER_LEFT',
                    username: ws.username,
                    userId: ws.userId,
                    room: MAIN_CHAT_ROOM,
                    message: `1111111111111111`,
                }),
            )
        },
        1000 * 60,
        true,
    )

    ws.send(
        JSON.stringify({
            type: 'CHAT_CONNECTED', // Новий тип для підтвердження підключення
            message: `Welcome, ${ws.username}! You are connected to the chat service.`,
            room: MAIN_CHAT_ROOM, // Інформуємо, до якої кімнати приєднано автоматично
        }),
    )

    // Оповіщення інших користувачів у кімнаті про приєднання
    await roomManager.sendMessageToRoom(MAIN_CHAT_ROOM, {
        type: 'CHAT_USER_JOINED',
        username: ws.username,
        userId: ws.userId,
        room: MAIN_CHAT_ROOM,
        message: `${ws.username} has joined the main chat.`,
        usersOnline: roomManager.getClientCount(MAIN_CHAT_ROOM), // Це кількість на поточному інстансі
    })
}

/**
 * Обробник повідомлення від клієнта в неймспейсі чату.
 * Диспетчеризує вхідні повідомлення за їх типом.
 * @param {import('../RoomManager.js').CustomWebSocket} ws - Об'єкт WebSocket клієнта.
 * @param {string | Buffer} message - Отримане повідомлення від клієнта.
 */
const handleChatMessage = async (ws, message) => {
    try {
        const parsedMessage = JSON.parse(message.toString())

        // Перевіряємо, чи повідомлення має коректну структуру
        if (!parsedMessage.type) {
            roomManager.logger.warn(
                `[Chat Namespace] Message from ${ws.username} missing 'type' field:`,
                parsedMessage,
            )
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Message must have a "type" field.' }))
            return
        }

        switch (parsedMessage.type) {
            case 'joinRoom': {
                const { roomName } = parsedMessage.payload || {}
                if (roomName) {
                    const fullRoomName = getChatRoomName(roomName)
                    await roomManager.joinRoom(fullRoomName, ws)
                    ws.send(
                        JSON.stringify({
                            type: 'JOIN_ROOM_SUCCESS',
                            room: fullRoomName,
                            message: `You have joined room: ${roomName}`,
                        }),
                    )
                    roomManager.logger.info(
                        `[Chat Namespace] ${ws.username} joined room: ${fullRoomName}`,
                    )
                    // Оповістити інших у кімнаті про нового учасника
                    await roomManager.sendMessageToRoom(fullRoomName, {
                        type: 'CHAT_USER_JOINED',
                        username: ws.username,
                        userId: ws.userId,
                        room: fullRoomName,
                        message: `${ws.username} has joined this room.`,
                    })
                } else {
                    ws.send(
                        JSON.stringify({
                            type: 'ERROR',
                            message: 'JOIN_ROOM requires "roomName" in payload.',
                        }),
                    )
                }
                break
            }

            case 'leaveRoom': {
                const { roomName } = parsedMessage.payload || {}
                if (roomName) {
                    const fullRoomName = getChatRoomName(roomName)
                    // Перевіряємо, чи клієнт дійсно був у цій кімнаті
                    // if (roomManager.isClientInRoom(fullRoomName, ws.id)) {
                    await roomManager.leaveRoom(fullRoomName, ws)
                    ws.send(
                        JSON.stringify({
                            type: 'LEAVE_ROOM_SUCCESS',
                            room: fullRoomName,
                            message: `You have left room: ${roomName}`,
                        }),
                    )
                    roomManager.logger.info(
                        `[Chat Namespace] ${ws.username} left room: ${fullRoomName}`,
                    )
                    // Оповістити інших про вихід учасника
                    await roomManager.sendMessageToRoom(fullRoomName, {
                        type: 'CHAT_USER_LEFT',
                        username: ws.username,
                        userId: ws.userId,
                        room: fullRoomName,
                        message: `${ws.username} has left this room.`,
                    })
                    // } else {
                    //     ws.send(
                    //         JSON.stringify({
                    //             type: 'ERROR',
                    //             message: `You are not in room: ${roomName}.`,
                    //         }),
                    //     )
                    // }
                } else {
                    ws.send(
                        JSON.stringify({
                            type: 'ERROR',
                            message: 'LEAVE_ROOM requires "roomName" in payload.',
                        }),
                    )
                }
                break
            }

            case 'sendMessage': {
                const { roomName, text } = parsedMessage.payload || {}
                if (roomName && text && typeof text === 'string' && text.trim().length > 0) {
                    const fullRoomName = getChatRoomName(roomName)
                    // Перевіряємо, чи клієнт є членом кімнати, в яку намагається надіслати повідомлення
                    // if (roomManager.isClientInRoom(fullRoomName, ws.id)) {
                    roomManager.logger.debug(
                        `[Chat Namespace] Message from ${ws.username} in ${fullRoomName}: ${text}`,
                    )
                    await roomManager.sendMessageToRoom(fullRoomName, {
                        type: 'CHAT_NEW_MESSAGE',
                        username: ws.username,
                        userId: ws.userId,
                        room: fullRoomName, // Вказуємо кімнату, звідки надійшло повідомлення
                        text: text.trim(),
                        timestamp: Date.now(),
                    })
                    // } else {
                    //     ws.send(
                    //         JSON.stringify({
                    //             type: 'ERROR',
                    //             message: `You are not authorized to send messages to room: ${roomName}.`,
                    //         }),
                    //     )
                    //     roomManager.logger.warn(
                    //         `[Chat Namespace] ${ws.username} tried to send message to unauthorized room: ${fullRoomName}`,
                    //     )
                    // }
                } else {
                    ws.send(
                        JSON.stringify({
                            type: 'ERROR',
                            message:
                                'SEND_MESSAGE requires "roomName" and non-empty "text" in payload.',
                        }),
                    )
                }
                break
            }

            case 'GET_USERS_IN_ROOM': {
                const { roomName } = parsedMessage.payload || {}
                if (roomName) {
                    const fullRoomName = getChatRoomName(roomName)
                    const users = roomManager.getRoomClientsInfo(fullRoomName) // Метод для отримання інформації про клієнтів
                    ws.send(
                        JSON.stringify({
                            type: 'USERS_IN_ROOM',
                            room: fullRoomName,
                            users: users.map((client) => ({
                                userId: client.userId,
                                username: client.username,
                            })),
                            count: users.length,
                        }),
                    )
                } else {
                    ws.send(
                        JSON.stringify({
                            type: 'ERROR',
                            message: 'GET_USERS_IN_ROOM requires "roomName" in payload.',
                        }),
                    )
                }
                break
            }

            default:
                roomManager.logger.warn(
                    `[Chat Namespace] Unknown message type from ${ws.username}: ${parsedMessage.type}`,
                )
                ws.send(
                    JSON.stringify({
                        type: 'ERROR',
                        message: `Unknown message type: ${parsedMessage.type}`,
                    }),
                )
                break
        }
    } catch (error) {
        roomManager.logger.error(
            `[Chat Namespace] Error parsing or handling message from ${ws.username}:`,
            error,
        )
        ws.send(
            JSON.stringify({ type: 'ERROR', message: 'Invalid message format or server error.' }),
        )
    }
}

/**
 * Обробник відключення клієнта від неймспейсу чату.
 * RoomManager автоматично обробляє вихід клієнта з кімнат при закритті з'єднання.
 * Тут надсилаємо оповіщення про вихід користувача.
 * @param {import('../RoomManager.js').CustomWebSocket} ws - Об'єкт WebSocket клієнта.
 */
const handleChatClose = async (ws) => {
    roomManager.logger.info(`[Chat Namespace] Client ${ws.username || ws.userId} disconnected.`)

    // // Отримуємо список кімнат, в яких перебував клієнт, перед тим як RoomManager його видалить
    // const clientRooms = Array.from(roomManager.getClientRooms(ws.id) || []) // Отримуємо копію Set

    // for (const roomName of clientRooms) {
    //     // Якщо кімната була чатовою, оповістити інших
    //     if (roomName.startsWith(CHAT_ROOM_PREFIX)) {
    //         // RoomManager автоматично видалить клієнта,
    //         // тому ми можемо одразу надсилати повідомлення про вихід.
    //         await roomManager.sendMessageToRoom(roomName, {
    //             type: 'CHAT_USER_LEFT',
    //             username: ws.username,
    //             userId: ws.userId,
    //             room: roomName,
    //             message: `${ws.username} has left the chat.`,
    //         })
    //     }
    // }
}

export default {
    handleConnection: handleChatConnection,
    handleMessage: handleChatMessage,
    handleClose: handleChatClose,
}
