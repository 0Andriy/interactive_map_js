// server.js

import http from 'http'
import { WebSocketServer } from 'ws'
import { parse } from 'url' // Для парсингу URL
import Core from './src/index.js'

const PORT = process.env.PORT || 8080
const globalLogger = Core.Logger.default

// 1. Створюємо HTTP-сервер
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('WebSocket server is running. Connect via WebSocket.\n')
})

// 2. Створюємо WebSocket-сервер
// Ми будемо використовувати `handleUpgrade` для ручної обробки шляхів
const wss = new WebSocketServer({ noServer: true })

// 3. Ініціалізуємо нашу Socket.IO-подібну систему
const io = new Core.Server(globalLogger)

// Заздалегідь створюємо деякі неймспейси та кімнати
const defaultNamespace = io.of('/')
const gameNamespace = io.of('/game')
const adminNamespace = io.of('/admin') // Новий неймспейс /admin

const lobbyRoom = defaultNamespace.createRoom('lobby', 'Main Lobby')
const generalChatRoom = defaultNamespace.createRoom('global-chat', 'Global Chat')

const arena1 = gameNamespace.createRoom('arena-1', 'Battle Arena 1')
const arena2 = gameNamespace.createRoom('arena-2', 'Battle Arena 2')

const adminControlRoom = adminNamespace.createRoom('control-room', 'Admin Control Panel')

gameArena1.addTask(
    'gameTick',
    async (roomInfo) => {
        roomInfo.sendMessage(`[${roomInfo.name}] Game Tick: ${Math.random().toFixed(2)}`, {
            type: 'game_tick',
        })
    },
    2000,
    true,
)

generalChatRoom.addTask(
    'chatStats',
    async (roomInfo) => {
        roomInfo.sendMessage(`[${roomInfo.name}] Connections: ${roomInfo.clients.length}.`, {
            type: 'chat_stats',
        })
    },
    4000,
    true,
)

globalLogger.info('Defined rooms:')
globalLogger.info(
    `  Default NS rooms: ${defaultNamespace
        .getAllRooms()
        .map((r) => r.name)
        .join(', ')}`,
)
globalLogger.info(
    `  Game NS rooms: ${gameNamespace
        .getAllRooms()
        .map((r) => r.name)
        .join(', ')}`,
)
globalLogger.info(
    `  Admin NS rooms: ${adminNamespace
        .getAllRooms()
        .map((r) => r.name)
        .join(', ')}`,
)

// 4. Обробка запитів на оновлення до WebSocket
server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url)

    // Перевіряємо, чи шлях відповідає одному з наших неймспейсів
    if (io.namespaces.has(pathname)) {
        wss.handleUpgrade(request, socket, head, (ws) => {
            const currentNamespace = io.of(pathname) // Отримуємо неймспейс для цього шляху
            let userId =
                request.headers['x-user-id'] ||
                `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
            let username = request.headers['x-user-name'] || `Guest_${userId.substring(5, 10)}`
            const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

            // Створюємо наш Client об'єкт і додаємо його до системи
            const client = io.addClientConnection(connectionId, userId, username, ws)

            globalLogger.info(
                `New WebSocket connection to NS "${currentNamespace.path}" from ${request.socket.remoteAddress}. Client Conn ID: ${client.id}, User: ${client.username} (ID: ${client.userId})`,
            )

            // Автоматично приєднуємо клієнта до цього конкретного неймспейсу
            // (Client вже доданий до Server'ом до дефолтного NS,
            // тепер він буде доданий і до цього неймспейсу через join в кімнату)

            // Важливо: клієнт має бути доданий до поточного неймспейсу
            // Або принаймні його кімнати повинні бути в цьому неймспейсі
            // За замовчуванням при підключенні до шляху /game клієнт повинен
            // приєднатися до кімнати в /game неймспейсі
            if (pathname === '/game') {
                arena1.join(client)
            } else if (pathname === '/admin') {
                adminControlRoom.join(client)
            } else {
                // Дефолтний неймспейс '/'
                lobbyRoom.join(client)
            }

            // 5. Обробка повідомлень від клієнта
            ws.on('message', (message) => {
                globalLogger.info(
                    `Received message from ${client.username} (${client.userId}) [Conn: ${client.id}] in NS "${currentNamespace.path}": ${message}`,
                )
                try {
                    const parsedMessage = JSON.parse(message.toString())

                    // Ручна маршрутизація повідомлень
                    // Socket.IO автоматично маршрутизує за неймспейсами
                    // Тут ми просто обробляємо повідомлення в межах поточного неймспейсу Client
                    switch (parsedMessage.type) {
                        case 'chat_message':
                            // Припустимо, клієнт надсилає { type: 'chat_message', roomId: 'lobby', text: 'Hello!' }
                            const targetRoomId = parsedMessage.roomId
                            const text = parsedMessage.text

                            const targetRoom = currentNamespace.getRoom(targetRoomId)

                            if (targetRoom) {
                                targetRoom.sendMessage(`[${client.username}]: ${text}`, {
                                    type: 'chat',
                                    metadata: { senderId: client.userId },
                                })
                            } else {
                                client.send({
                                    type: 'error',
                                    message: `Room '${targetRoomId}' not found in namespace '${currentNamespace.path}'.`,
                                })
                                globalLogger.warn(
                                    `Client ${client.username} tried to send message to non-existent room: ${targetRoomId} in ${currentNamespace.path}`,
                                )
                            }
                            break
                        case 'join_room':
                            const newRoomId = parsedMessage.roomId
                            const roomToJoin = currentNamespace.getRoom(newRoomId)
                            if (roomToJoin) {
                                // Виходимо з усіх поточних кімнат клієнта в цьому неймспейсі перед приєднанням до нової
                                currentNamespace.getAllRooms().forEach((r) => r.leave(client))
                                roomToJoin.join(client)
                                client.send({
                                    type: 'info',
                                    message: `Successfully joined room "${roomToJoin.name}".`,
                                })
                            } else {
                                client.send({
                                    type: 'error',
                                    message: `Room '${newRoomId}' not found in namespace '${currentNamespace.path}'.`,
                                })
                                globalLogger.warn(
                                    `Client ${client.username} tried to join non-existent room: ${newRoomId} in ${currentNamespace.path}`,
                                )
                            }
                            break
                        case 'private_message':
                            // Припустимо, клієнт надсилає { type: 'private_message', targetUserId: 'target_id', text: 'Secret!' }
                            const targetUserId = parsedMessage.targetUserId
                            const pmText = parsedMessage.text
                            if (targetUserId && pmText) {
                                io.sendToUser(
                                    targetUserId,
                                    `[PRIVATE from ${client.username}]: ${pmText}`,
                                    {
                                        type: 'private_chat',
                                        metadata: { senderUserId: client.userId },
                                    },
                                )
                                client.send({
                                    type: 'info',
                                    message: `Private message sent to User ID ${targetUserId}.`,
                                })
                            } else {
                                client.send({
                                    type: 'error',
                                    message: 'Missing targetUserId or text for private message.',
                                })
                            }
                            break
                        default:
                            client.send({ type: 'error', message: 'Unknown message type.' })
                            break
                    }
                } catch (e) {
                    globalLogger.error(
                        `Error parsing message from ${client.username} (${client.userId}) [Conn: ${client.id}]: ${e.message}. Message: ${message}`,
                    )
                    client.send({ type: 'error', message: 'Invalid JSON message.' })
                }
            })

            // 6. Обробка відключення клієнта
            ws.on('close', () => {
                globalLogger.info(
                    `WebSocket connection closed for ${client.username} (ID: ${client.userId}, Conn: ${client.id}).`,
                )
                io.disconnectClient(client) // Повідомляємо нашу систему про відключення
            })

            ws.on('error', (error) => {
                globalLogger.error(
                    `WebSocket error for ${client.username} (ID: ${client.userId}, Conn: ${client.id}): ${error.message}`,
                )
            })

            // Тестове повідомлення при підключенні
            client.send({
                type: 'welcome',
                message: `Welcome, ${client.username}! You are connected to namespace "${currentNamespace.path}". Your User ID is ${client.userId}. Your connection ID is ${client.id}.`,
                room: lobbyRoom.name, // Якщо auto-joined to lobby
            })
        })
    } else {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
        socket.destroy()
        globalLogger.warn(`Rejected WebSocket connection attempt to unknown path: ${pathname}`)
    }
})

// 7. Запускаємо HTTP-сервер
server.listen(PORT, () => {
    globalLogger.info(`HTTP and WebSocket server listening on port ${PORT}`)
    globalLogger.info(`Test with wscat:`)
    globalLogger.info(
        `  Default NS: npx wscat -c ws://localhost:${PORT}/ -H "X-User-Id: user123" -H "X-User-Name: Alice"`,
    )
    globalLogger.info(
        `  Game NS: npx wscat -c ws://localhost:${PORT}/game -H "X-User-Id: user123" -H "X-User-Name: Alice"`,
    )
    globalLogger.info(
        `  Admin NS: npx wscat -c ws://localhost:${PORT}/admin -H "X-User-Id: admin456" -H "X-User-Name: BobAdmin"`,
    )
    globalLogger.info(`Use an HTML file for interactive testing.`)
})

// Обробка завершення роботи сервера
process.on('SIGINT', () => {
    globalLogger.warn('SIGINT signal received. Closing server...')
    io.destroy()
    wss.close(() => {
        globalLogger.info('WebSocket server closed.')
        server.close(() => {
            globalLogger.info('HTTP server closed. Exiting.')
            process.exit(0)
        })
    })
})
