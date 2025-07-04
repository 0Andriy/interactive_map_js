// src/websockets/chat.websocketService.js

import { WebSocket } from 'ws' // Імпорт WebSocket для доступу до WebSocket.OPEN
// RoomManager тут не імпортується як клас, бо інстанс буде переданий.
// import RoomManager from './RoomManager.js'; // Не потрібно, якщо отримуємо з параметрів

function initConnection(ws, chatRoomManager, decodedToken) {
    if (!decodedToken) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'Authentication required for chat.' }))
        ws.close(1008, 'Authentication required')
        return
    }

    const user = {
        userId: decodedToken.userId,
        username: decodedToken.username,
        ws: ws,
    }

    const mainChatRoomId = `chat:main_lobby`
    chatRoomManager.joinRoom(user, mainChatRoomId)

    ws.send(
        JSON.stringify({
            type: 'CHAT_CONNECTED',
            message: `Вітаємо, ${user.username}! Ви успішно підключились до чату.`,
            room: mainChatRoomId,
        }),
    )

    ws.on('message', (message) => {
        const msg = JSON.parse(message)

        switch (msg.type) {
            case 'SEND_MESSAGE':
                const roomName = `chat:${msg.payload.roomName}`
                const text = msg.payload.text
                if (chatRoomManager.isUserInRoom(user.userId, roomName)) {
                    chatRoomManager.sendMessageToRoom(roomName, {
                        type: 'CHAT_NEW_MESSAGE',
                        room: roomName,
                        username: user.username,
                        text: text,
                    })
                } else {
                    ws.send(
                        JSON.stringify({
                            type: 'ERROR',
                            message: `Ви не перебуваєте в кімнаті "${roomName.replace(
                                'chat:',
                                '',
                            )}".`,
                        }),
                    )
                }
                break
            case 'JOIN_ROOM':
                const joinRoomId = `chat:${msg.payload.roomName}`
                chatRoomManager.joinRoom(user, joinRoomId)
                ws.send(
                    JSON.stringify({
                        type: 'JOIN_ROOM_SUCCESS',
                        message: `Ви приєдналися до кімнати "${msg.payload.roomName}".`,
                        room: joinRoomId,
                    }),
                )
                chatRoomManager.broadcastToRoom(
                    joinRoomId,
                    {
                        type: 'CHAT_USER_JOINED',
                        userId: user.userId,
                        username: user.username,
                        room: joinRoomId,
                    },
                    user.userId,
                )
                break
            case 'LEAVE_ROOM':
                const leaveRoomId = `chat:${msg.payload.roomName}`
                if (leaveRoomId === mainChatRoomId) {
                    ws.send(
                        JSON.stringify({
                            type: 'ERROR',
                            message: `Не можна покинути основну кімнату "${msg.payload.roomName}".`,
                        }),
                    )
                    break
                }
                chatRoomManager.leaveRoom(user.userId, leaveRoomId)
                ws.send(
                    JSON.stringify({
                        type: 'LEAVE_ROOM_SUCCESS',
                        message: `Ви покинули кімнату "${msg.payload.roomName}".`,
                        room: leaveRoomId,
                    }),
                )
                chatRoomManager.broadcastToRoom(
                    leaveRoomId,
                    {
                        type: 'CHAT_USER_LEFT',
                        userId: user.userId,
                        username: user.username,
                        room: leaveRoomId,
                    },
                    user.userId,
                )
                break
            case 'GET_USERS_IN_ROOM':
                const targetRoomId = `chat:${msg.payload.roomName}`
                const usersInRoom = chatRoomManager.getUsersInRoom(targetRoomId)
                ws.send(
                    JSON.stringify({
                        type: 'USERS_IN_ROOM',
                        room: targetRoomId,
                        count: usersInRoom.length,
                        users: usersInRoom.map((u) => ({ userId: u.userId, username: u.username })),
                    }),
                )
                break
            default:
                console.warn('Невідомий тип повідомлення в чаті:', msg.type)
                ws.send(JSON.stringify({ type: 'ERROR', message: 'Невідомий тип повідомлення.' }))
        }
    })

    ws.on('close', (code, reason) => {
        console.log(
            `User ${user.username} disconnected from chat. Code: ${code}, Reason: ${reason}`,
        )
        chatRoomManager.removeUserFromAllRooms(user.userId)
    })

    ws.on('error', (err) => {
        console.error(`WebSocket chat error for ${user.username}:`, err)
        chatRoomManager.removeUserFromAllRooms(user.userId)
    })

    ws.isAlive = true
    ws.on('pong', () => {
        ws.isAlive = true
    })
}

function sendMessageFromRest(roomId, messagePayload, namespaceManagers) {
    // Отримуємо manager для чату
    const manager = namespaceManagers.chat.roomManager
    if (manager) {
        manager.sendMessageToRoom(roomId, messagePayload)
        return true
    }
    return false
}

export { initConnection, sendMessageFromRest }
