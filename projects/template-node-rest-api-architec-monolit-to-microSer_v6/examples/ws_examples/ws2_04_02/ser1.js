import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { createClient } from 'redis' // Для Redis Pub/Sub та керування станом

// ===============================================
// 1. Налаштування HTTP/WebSocket Сервера
// ===============================================
const httpServer = createServer((req, res) => {
    // Тут можна обслуговувати статичні файли або інші HTTP-запити
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<h1>WebSocket Chat Server</h1><p>Connect via WebSocket.</p>')
    } else {
        res.writeHead(404)
        res.end()
    }
})

const wss = new WebSocketServer({ server: httpServer })

// ===============================================
// 2. Налаштування Redis для Pub/Sub та стану
// ===============================================
const redisPubClient = createClient({ url: 'redis://localhost:6379' })
const redisSubClient = redisPubClient.duplicate()

redisPubClient.on('error', (err) => console.error('Redis Publisher Error:', err))
redisSubClient.on('error', (err) => console.error('Redis Subscriber Error:', err))

await Promise.all([redisPubClient.connect(), redisSubClient.connect()])
console.log('Connected to Redis')

// Канал Redis для широкомовних повідомлень між серверами
const CHAT_CHANNEL = 'global_chat_messages'

// ===============================================
// 3. Зберігання та керування клієнтами та "кімнатами"
// ===============================================
// Map: socket.id -> WebSocket
const clients = new Map()
// Map: chat_id -> Set<socket.id> (наша власна реалізація "кімнат")
const chatRooms = new Map()
// Map: socket.id -> user_id
const socketToUserMap = new Map()
// Map: user_id -> username (для зручності)
const userIdToUsernameMap = new Map()

// ===============================================
// 4. Обробка вхідних WebSocket-з'єднань
// ===============================================
wss.on('connection', async (ws, req) => {
    // Генеруємо унікальний ID для кожного сокета (як Socket.IO)
    ws.id =
        Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    clients.set(ws.id, ws)

    console.log(`New WebSocket connection: ${ws.id}`)

    // --- Автентифікація (з query parameters або заголовків) ---
    // У реальному додатку:
    // const token = new URLSearchParams(req.url.split('?')[1]).get('token');
    // або парсити Cookie/Authorization Header
    // const user = await verifyToken(token); // Ваша функція автентифікації
    // if (!user) {
    //     ws.send(JSON.stringify({ type: 'error', message: 'Authentication failed' }));
    //     return ws.close();
    // }
    const userId = `user_${ws.id.substring(0, 5)}` // Заглушка для User ID
    const username = `Guest_${ws.id.substring(0, 5)}` // Заглушка для Username

    ws.userId = userId
    ws.username = username
    socketToUserMap.set(ws.id, userId)
    userIdToUsernameMap.set(userId, username)

    console.log(`User ${username} (${userId}) connected via WebSocket: ${ws.id}`)
    ws.send(JSON.stringify({ type: 'system', message: `Welcome, ${username}! Your ID: ${ws.id}` }))

    // --- Логіка присутності (Presence) ---
    await updatePresenceStatus(userId, true) // Встановлюємо онлайн статус у Redis
    // Сповіщаємо всі пов'язані чати про приєднання користувача
    const userChatIds = await getUserChatRoomsFromDb(userId) // Отримати з БД чати користувача
    userChatIds.forEach((chatId) => {
        // Ми не "приєднуємо" сокет до кімнати тут, ми просто реєструємо
        // що цей сокет є учасником цього чату для майбутніх розсилок.
        // Забезпечуємо, що чат-кімната існує в нашому локальному мапі
        if (!chatRooms.has(chatId)) {
            chatRooms.set(chatId, new Set())
        }
        chatRooms.get(chatId).add(ws.id)
        // Сповіщаємо інших учасників чату (через Redis Pub/Sub)
        redisPubClient.publish(
            CHAT_CHANNEL,
            JSON.stringify({
                type: 'user_joined_chat',
                payload: { chatId, userId, username, socketId: ws.id },
            }),
        )
    })

    // ===============================================
    // 5. Обробка вхідних повідомлень від клієнта
    // ===============================================
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString())
            console.log(`Received message from ${ws.id}:`, data)

            switch (data.type) {
                case 'join_chat':
                    const { chatId: joinChatId } = data.payload
                    // Перевірка прав доступу до чату
                    const isAllowed = await checkUserAccessToChat(ws.userId, joinChatId)
                    if (isAllowed) {
                        if (!chatRooms.has(joinChatId)) {
                            chatRooms.set(joinChatId, new Set())
                        }
                        chatRooms.get(joinChatId).add(ws.id)
                        ws.send(
                            JSON.stringify({
                                type: 'system',
                                message: `You joined chat: ${joinChatId}`,
                            }),
                        )
                        console.log(`User ${ws.username} joined chat: ${joinChatId}`)
                        // Повідомляємо інших через Redis
                        redisPubClient.publish(
                            CHAT_CHANNEL,
                            JSON.stringify({
                                type: 'user_joined_chat',
                                payload: {
                                    chatId: joinChatId,
                                    userId: ws.userId,
                                    username: ws.username,
                                    socketId: ws.id,
                                },
                            }),
                        )
                    } else {
                        ws.send(JSON.stringify({ type: 'error', message: 'Access denied to chat' }))
                    }
                    break

                case 'chat_message':
                    const { chatId: msgChatId, text } = data.payload
                    if (!chatRooms.has(msgChatId) || !chatRooms.get(msgChatId).has(ws.id)) {
                        return ws.send(
                            JSON.stringify({ type: 'error', message: 'Not a member of this chat' }),
                        )
                    }

                    const chatMessage = {
                        chatId: msgChatId,
                        senderId: ws.userId,
                        senderName: ws.username,
                        text,
                        timestamp: new Date().toISOString(),
                    }

                    // Збереження повідомлення в БД
                    await saveMessageToDb(chatMessage)

                    // Публікація повідомлення в Redis для розсилки всім інстансам
                    redisPubClient.publish(
                        CHAT_CHANNEL,
                        JSON.stringify({
                            type: 'chat_message',
                            payload: chatMessage,
                        }),
                    )
                    break

                case 'typing_indicator':
                    const { chatId: typingChatId } = data.payload
                    if (!chatRooms.has(typingChatId) || !chatRooms.get(typingChatId).has(ws.id)) {
                        return // Ігноруємо, якщо не в чаті
                    }
                    redisPubClient.publish(
                        CHAT_CHANNEL,
                        JSON.stringify({
                            type: 'typing_indicator',
                            payload: {
                                chatId: typingChatId,
                                userId: ws.userId,
                                username: ws.username,
                                socketId: ws.id,
                            },
                        }),
                    )
                    break

                default:
                    console.warn(`Unknown message type: ${data.type}`)
                    ws.send(
                        JSON.stringify({
                            type: 'error',
                            message: `Unknown message type: ${data.type}`,
                        }),
                    )
            }
        } catch (error) {
            console.error(`Error parsing message from ${ws.id}:`, error)
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }))
        }
    })

    // ===============================================
    // 6. Обробка відключення клієнта
    // ===============================================
    ws.on('close', async () => {
        console.log(`WebSocket disconnected: ${ws.id}`)
        clients.delete(ws.id)
        socketToUserMap.delete(ws.id)

        // Видаляємо сокет з усіх чат-кімнат, де він був зареєстрований
        for (const [chatId, socketIds] of chatRooms.entries()) {
            if (socketIds.has(ws.id)) {
                socketIds.delete(ws.id)
                // Повідомляємо через Redis про вихід користувача
                redisPubClient.publish(
                    CHAT_CHANNEL,
                    JSON.stringify({
                        type: 'user_left_chat',
                        payload: {
                            chatId,
                            userId: ws.userId,
                            username: ws.username,
                            socketId: ws.id,
                        },
                    }),
                )
            }
        }

        // Оновлюємо статус присутності
        await updatePresenceStatus(ws.userId, false) // Встановлюємо офлайн, якщо немає інших з'єднань
    })

    ws.on('error', (err) => {
        console.error(`WebSocket error for ${ws.id}:`, err)
    })
})

// ===============================================
// 7. Обробка повідомлень з Redis (для міжсерверної комунікації)
// ===============================================
redisSubClient.subscribe(CHAT_CHANNEL, (message) => {
    try {
        const data = JSON.parse(message)
        const { type, payload } = data

        // Розсилаємо повідомлення відповідним клієнтам на цьому інстансі
        if (payload.chatId && chatRooms.has(payload.chatId)) {
            const targetSocketIds = chatRooms.get(payload.chatId)
            for (const socketId of targetSocketIds) {
                const clientWs = clients.get(socketId)
                if (clientWs && clientWs.readyState === ws.OPEN) {
                    // Уникаємо відправки назад відправнику на цьому ж інстансі для 'typing_indicator'
                    if (type === 'typing_indicator' && payload.socketId === clientWs.id) {
                        continue
                    }
                    clientWs.send(JSON.stringify(data))
                }
            }
        } else if (type === 'user_joined_chat' || type === 'user_left_chat') {
            // Оновлення списку користувачів онлайн може бути глобальним або для конкретних чатів
            // Ця логіка може бути складнішою, залежно від того, як ви показуєте онлайн-статус
            // Для прикладу, просто логуємо
            console.log(
                `Redis broadcast: ${type} - User ${payload.username} in chat ${payload.chatId}`,
            )
        }
    } catch (error) {
        console.error('Error processing Redis message:', error)
    }
})

// ===============================================
// Заглушки для взаємодії з БД та Redis
// ===============================================
async function verifyToken(token) {
    // В реальному додатку: перевірка JWT з User Service
    return { id: 'user123', username: 'TestUser' }
}

async function getUserChatRoomsFromDb(userId) {
    // Отримати з БД список chat_id, до яких належить користувач
    // Це потрібно для початкового приєднання сокета до "кімнат"
    return ['chat_general', 'chat_private_abc']
}

async function checkUserAccessToChat(userId, chatId) {
    // Перевірка в БД, чи користувач є учасником або має права на чат
    return true // Заглушка
}

async function saveMessageToDb(message) {
    console.log(`Saving message to DB: ${JSON.stringify(message)}`)
    // Логіка збереження повідомлення в БД
    return Promise.resolve()
}

async function updatePresenceStatus(userId, isOnline) {
    // Використання Redis Set для відстеження всіх socketId для даного userId
    // і Redis Hash для глобального статусу онлайн/офлайн
    if (isOnline) {
        await redisPubClient.sAdd(`user_sockets:${userId}`, 'some_socket_id') // Тут має бути реальний socketId, або id інстансу
        await redisPubClient.hSet('online_users_status', userId, 'online')
    } else {
        await redisPubClient.sRem(`user_sockets:${userId}`, 'some_socket_id')
        const remainingSockets = await redisPubClient.sMembers(`user_sockets:${userId}`)
        if (remainingSockets.length === 0) {
            await redisPubClient.hSet('online_users_status', userId, 'offline')
        }
    }
    // Можливо, розсилати оновлення статусу присутності через окремий Redis канал
    redisPubClient.publish('presence_updates', JSON.stringify({ userId, isOnline }))
}

// Запускаємо сервер
const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => {
    console.log(`WebSocket server running on port ${PORT}`)
    console.log(`ws://localhost:${PORT}`)
})
