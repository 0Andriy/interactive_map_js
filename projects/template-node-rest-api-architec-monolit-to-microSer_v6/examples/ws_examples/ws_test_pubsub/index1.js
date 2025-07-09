// server.js (цей файл запускаємо через node server.js)

import http from 'http'
import { WebSocketServer } from 'ws' // Імпортуємо WebSocketServer з ws
import Core from './src/index.js' // Імпортуємо наш Core Library

const PORT = process.env.PORT || 8080
const globalLogger = Core.Logger.default

// 1. Створюємо HTTP-сервер
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('WebSocket server is running. Connect via WebSocket.\n')
})

// 2. Створюємо WebSocket-сервер і прив'язуємо його до HTTP-сервера
const wss = new WebSocketServer({ server })

// 3. Ініціалізуємо нашу Socket.IO-подібну систему
const io = new Core.Server(globalLogger)

// Отримуємо неймспейси та кімнати
const defaultNamespace = io.of('/')
const gameNamespace = io.of('/game')

const lobbyRoom = defaultNamespace.createRoom('lobby', 'Main Lobby')
const gameArena1 = gameNamespace.createRoom('arena-1', 'Battle Arena 1')

gameArena1.addTask(
    'gameTick',
    async (roomInfo) => {
        roomInfo.sendMessage(`[${roomInfo.roomName}] Ігровий тік: ${Math.random().toFixed(2)}`, {
            type: 'game_tick',
        })
    },
    2000,
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

// 4. Обробка WebSocket-з'єднань
wss.on('connection', (ws, req) => {
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    const clientName = `User_${clientId.substring(7, 12)}`

    // Створюємо наш Client об'єкт і додаємо його до системи
    const client = io.addClientConnection(clientId, clientName, ws)

    globalLogger.info(
        `New WebSocket connection from ${req.socket.remoteAddress}. Client ID: ${client.id}, Name: ${client.name}`,
    )

    // Приклад: автоматично приєднуємо нового клієнта до лобі-кімнати
    lobbyRoom.join(client)

    // 5. Обробка повідомлень від клієнта
    ws.on('message', (message) => {
        globalLogger.info(`Received message from ${client.name} (${client.id}): ${message}`)
        try {
            const parsedMessage = JSON.parse(message.toString())

            // Приклад: проста маршрутизація повідомлень на основі 'type'
            // У реальному додатку тут була б більш складна логіка обробки подій
            switch (parsedMessage.type) {
                case 'chat_message':
                    // Припустимо, клієнт надсилає { type: 'chat_message', roomId: 'lobby', text: 'Hello!' }
                    const targetRoomId = parsedMessage.roomId
                    const text = parsedMessage.text

                    let targetRoom
                    // Спробуємо знайти кімнату в дефолтному неймспейсі
                    targetRoom = defaultNamespace.getRoom(targetRoomId)
                    if (!targetRoom) {
                        // Якщо не знайдено, спробуємо в ігровому неймспейсі
                        targetRoom = gameNamespace.getRoom(targetRoomId)
                    }

                    if (targetRoom) {
                        targetRoom.sendMessage(`[${client.name}]: ${text}`, {
                            type: 'chat',
                            metadata: { senderId: client.id },
                        })
                    } else {
                        client.send({ type: 'error', message: `Room '${targetRoomId}' not found.` })
                        globalLogger.warn(
                            `Client ${client.name} tried to send message to non-existent room: ${targetRoomId}`,
                        )
                    }
                    break
                case 'join_room':
                    // Припустимо, клієнт надсилає { type: 'join_room', roomId: 'arena-1', namespacePath: '/game' }
                    const joinRoomId = parsedMessage.roomId
                    const joinNsPath = parsedMessage.namespacePath || '/'

                    const nsToJoin = io.of(joinNsPath)
                    const roomToJoin = nsToJoin.getRoom(joinRoomId)

                    if (roomToJoin) {
                        // Спочатку вийдемо з усіх поточних кімнат клієнта в цьому неймспейсі
                        // (У Socket.IO join() автоматично виводить з попередньої кімнати,
                        // якщо вона не дефолтна). Тут для простоти, просто приєднуємо.
                        // Для реального "переходу" потрібно спочатку leave() з попередніх кімнат
                        // в цьому неймспейсі, потім join() до нової.
                        roomToJoin.join(client)
                    } else {
                        client.send({
                            type: 'error',
                            message: `Room '${joinRoomId}' in namespace '${joinNsPath}' not found.`,
                        })
                        globalLogger.warn(
                            `Client ${client.name} tried to join non-existent room: ${joinRoomId} in ${joinNsPath}`,
                        )
                    }
                    break
                // Інші типи повідомлень...
                default:
                    client.send({ type: 'error', message: 'Unknown message type.' })
                    break
            }
        } catch (e) {
            globalLogger.error(
                `Error parsing message from ${client.name}: ${e.message}. Message: ${message}`,
            )
            client.send({ type: 'error', message: 'Invalid JSON message.' })
        }
    })

    // 6. Обробка відключення клієнта
    ws.on('close', () => {
        globalLogger.info(`WebSocket connection closed for ${client.name} (${client.id}).`)
        io.disconnectClient(client) // Повідомляємо нашу систему про відключення
    })

    ws.on('error', (error) => {
        globalLogger.error(`WebSocket error for ${client.name} (${client.id}): ${error.message}`)
        // `close` подія також буде викликана після помилки
    })
})

// 7. Запускаємо HTTP-сервер
server.listen(PORT, () => {
    globalLogger.info(`HTTP and WebSocket server listening on port ${PORT}`)
    globalLogger.info(`Test with: npx wscat -c ws://localhost:${PORT}`)
    globalLogger.info(`Or with a simple HTML file.`)
})

// Обробка завершення роботи сервера
process.on('SIGINT', () => {
    globalLogger.warn('SIGINT signal received. Closing server...')
    io.destroy() // Знищуємо нашу систему
    wss.close(() => {
        globalLogger.info('WebSocket server closed.')
        server.close(() => {
            globalLogger.info('HTTP server closed. Exiting.')
            process.exit(0)
        })
    })
})
