// server.js

import http from 'http'
import { WebSocketServer } from 'ws'
import { parse } from 'url'
import { Server } from './src/core/Server.js' // Імпортуємо Server напряму

const PORT = process.env.PORT || 8080

// 1. Створення HTTP-сервера
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('WebSocket сервер працює. Підключіться через WebSocket.\n')
})

// 2. Створення WebSocket-сервера
const wss = new WebSocketServer({ noServer: true })

// 3. Ініціалізація нашої системи
const io = new Server(console) // Передаємо console як логер для Server

// Попереднє створення деяких неймспейсів та кімнат
const defaultNamespace = io.of('/')
const gameNamespace = io.of('/game')
const adminNamespace = io.of('/admin')

// Створюємо постійні кімнати з isPersistent = true
const lobbyRoom = defaultNamespace.createRoom('lobby', 'Головне лобі', true) // Постійна кімната
const generalChatRoom = defaultNamespace.createRoom('global-chat', 'Глобальний чат', true) // Постійна кімната
const adminControlRoom = adminNamespace.createRoom(
    'control-room',
    'Панель керування адміністратора',
    true,
) // Постійна кімната

// Додаємо завдання до постійних кімнат
lobbyRoom.addTask(
    'lobbyPulse',
    async (roomInfo) => {
        roomInfo.sendMessage(
            `[${roomInfo.name}] Пульс лобі: ${new Date().toLocaleTimeString('uk-UA')}`,
            { type: 'lobby_info' },
        )
    },
    5000,
    true,
)

generalChatRoom.addTask(
    'chatStats',
    async (roomInfo) => {
        roomInfo.sendMessage(`[${roomInfo.name}] З'єднань: ${roomInfo.clients.length}.`, {
            type: 'chat_stats',
        })
    },
    4000,
    true,
)

console.info('Визначені кімнати (початкові):')
console.info(
    `  Неймспейс за замовчуванням: ${defaultNamespace
        .getAllRooms()
        .map((r) => `${r.name} (ID: ${r.id}, Постійна: ${r.isPersistent})`)
        .join(', ')}`,
)
console.info(
    `  Ігровий неймспейс: ${gameNamespace
        .getAllRooms()
        .map((r) => `${r.name} (ID: ${r.id}, Постійна: ${r.isPersistent})`)
        .join(', ')}`,
)
console.info(
    `  Неймспейс адміністратора: ${adminNamespace
        .getAllRooms()
        .map((r) => `${r.name} (ID: ${r.id}, Постійна: ${r.isPersistent})`)
        .join(', ')}`,
)

// 4. Обробка WebSocket upgrade запитів
server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url)

    // Перевірити, чи шлях відповідає одному з наших неймспейсів
    if (io.namespaces.has(pathname)) {
        wss.handleUpgrade(request, socket, head, (ws) => {
            const currentNamespace = io.of(pathname) // Отримати неймспейс для цього шляху
            const queryParams = new URLSearchParams(parse(request.url).query)
            let userId =
                queryParams.get('userId') ||
                request.headers['x-user-id'] ||
                `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
            let username =
                queryParams.get('username') ||
                request.headers['x-user-name'] ||
                `Гість_${userId.substring(5, 10)}`
            const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

            // Створити наш об'єкт Client та додати його до системи
            const client = io.addClientConnection(connectionId, userId, username, ws)

            io.logger.info(
                `Нове WebSocket з'єднання до Неймспейсу "${currentNamespace.path}" з ${request.socket.remoteAddress}. ID з'єднання клієнта: ${client.id}, Користувач: ${client.username} (ID: ${client.userId})`,
            )

            // Автоматично приєднати клієнтів до кімнати за замовчуванням на основі неймспейсу
            if (pathname === '/admin') {
                adminControlRoom.join(client)
            } else {
                // За замовчуванням або Ігровий неймспейс - приєднатися до лобі наразі
                lobbyRoom.join(client)
            }

            // 5. Обробка повідомлень від клієнта
            ws.on('message', (message) => {
                io.logger.info(
                    `Отримано повідомлення від ${client.username} (${client.userId}) [З'єднання: ${client.id}] у Неймспейсі "${currentNamespace.path}": ${message}`,
                )
                try {
                    const parsedMessage = JSON.parse(message.toString())

                    switch (parsedMessage.type) {
                        case 'chat_message':
                            const targetRoomIdChat = parsedMessage.roomId
                            const text = parsedMessage.text

                            if (!targetRoomIdChat || !text) {
                                client.send({
                                    type: 'error',
                                    message: 'Відсутній roomId або text для повідомлення чату.',
                                })
                                return
                            }

                            let roomForChat = currentNamespace.getRoom(targetRoomIdChat)

                            if (!roomForChat) {
                                // --- ПРИКЛАД ДИНАМІЧНОГО СТВОРЕННЯ КІМНАТИ (НЕПОСТІЙНА) ---
                                // Кімната для чату, яка автоматично видалиться, коли стане порожньою
                                roomForChat = currentNamespace.createRoom(
                                    targetRoomIdChat,
                                    `Динамічний чат: ${targetRoomIdChat}`,
                                    false,
                                ) // isPersistent = false
                                io.logger.info(
                                    `Динамічно створено кімнату "${roomForChat.name}" (ID: ${roomForChat.id}) у неймспейсі "${currentNamespace.path}" для повідомлення чату. Вона буде видалена, коли стане порожньою.`,
                                )
                            }

                            // Переконатися, що клієнт перебуває в цій кімнаті перед надсиланням повідомлення
                            if (!roomForChat.getClients().some((c) => c.id === client.id)) {
                                roomForChat.join(client)
                                client.send({
                                    type: 'info',
                                    message: `Вас автоматично приєднано до кімнати "${roomForChat.name}" для надсилання повідомлень.`,
                                })
                            }

                            roomForChat.sendMessage(`[${client.username}]: ${text}`, {
                                type: 'chat',
                                metadata: { senderId: client.userId },
                            })
                            break

                        case 'join_room':
                            const newRoomId = parsedMessage.roomId
                            if (!newRoomId) {
                                client.send({
                                    type: 'error',
                                    message: 'Відсутній roomId для повідомлення join_room.',
                                })
                                return
                            }

                            let roomToJoin = currentNamespace.getRoom(newRoomId)

                            if (!roomToJoin) {
                                // --- ПРИКЛАД ДИНАМІЧНОГО СТВОРЕННЯ КІМНАТИ З УМОВАМИ ---
                                let isNewRoomPersistent = false
                                if (newRoomId === 'vip_lounge') {
                                    // Наприклад, VIP-кімната може бути постійною
                                    isNewRoomPersistent = true
                                }

                                roomToJoin = currentNamespace.createRoom(
                                    newRoomId,
                                    `Динамічна кімната: ${newRoomId}`,
                                    isNewRoomPersistent,
                                )
                                io.logger.info(
                                    `Динамічно створено кімнату "${roomToJoin.name}" (ID: ${roomToJoin.id}) у неймспейсі "${currentNamespace.path}" для запиту на приєднання. Постійна: ${roomToJoin.isPersistent}.`,
                                )

                                // Для ігрових кімнат, за бажанням, додати завдання "ігрового такту" при створенні
                                if (
                                    currentNamespace.path === '/game' &&
                                    newRoomId.startsWith('arena')
                                ) {
                                    roomToJoin.addTask(
                                        'gameTick',
                                        async (rInfo) => {
                                            rInfo.sendMessage(
                                                `[${
                                                    rInfo.name
                                                }] Ігровий такт: ${Math.random().toFixed(2)}`,
                                                { type: 'game_tick' },
                                            )
                                        },
                                        2000,
                                        true,
                                    )
                                    io.logger.info(
                                        `Додано завдання 'gameTick' до динамічно створеної ігрової кімнати "${roomToJoin.name}".`,
                                    )
                                }
                            }

                            // Залишити всі поточні кімнати в цьому неймспейсі перед приєднанням до нової
                            currentNamespace.getAllRooms().forEach((r) => {
                                if (
                                    r.getClients().some((c) => c.id === client.id) &&
                                    r.id !== roomToJoin.id
                                ) {
                                    r.leave(client)
                                }
                            })

                            roomToJoin.join(client)
                            client.send({
                                type: 'info',
                                message: `Успішно приєднано до кімнати "${roomToJoin.name}" (ID: ${roomToJoin.id}) у неймспейсі "${currentNamespace.path}".`,
                            })
                            break

                        case 'private_message':
                            const targetUserId = parsedMessage.targetUserId
                            const pmText = parsedMessage.text
                            if (targetUserId && pmText) {
                                io.sendToUser(
                                    targetUserId,
                                    `[ПРИВАТНЕ від ${client.username}]: ${pmText}`,
                                    {
                                        type: 'private_chat',
                                        metadata: { senderUserId: client.userId },
                                    },
                                )
                                client.send({
                                    type: 'info',
                                    message: `Приватне повідомлення надіслано Користувачу з ID ${targetUserId}.`,
                                })
                            } else {
                                client.send({
                                    type: 'error',
                                    message:
                                        'Відсутній targetUserId або text для приватного повідомлення.',
                                })
                            }
                            break
                        default:
                            client.send({ type: 'error', message: 'Невідомий тип повідомлення.' })
                            break
                    }
                } catch (e) {
                    io.logger.error(
                        `Помилка розбору повідомлення від ${client.username} (${client.userId}) [З'єднання: ${client.id}]: ${e.message}. Повідомлення: ${message}`,
                    )
                    client.send({ type: 'error', message: 'Недійсне JSON повідомлення.' })
                }
            })

            // 6. Обробка відключення клієнта
            ws.on('close', () => {
                io.logger.info(
                    `WebSocket з'єднання закрито для ${client.username} (ID: ${client.userId}, З'єднання: ${client.id}).`,
                )
                io.disconnectClient(client) // Повідомити нашу систему про відключення
            })

            ws.on('error', (error) => {
                io.logger.error(
                    `WebSocket error для ${client.username} (ID: ${client.userId}, З'єднання: ${client.id}): ${error.message}`,
                )
            })

            // Тестове вітальне повідомлення при підключенні
            client.send({
                type: 'welcome',
                message: `Ласкаво просимо, ${client.username}! Ви підключені до неймспейсу "${currentNamespace.path}". Ваш ID користувача: ${client.userId}. Ваш ID з'єднання: ${client.id}.`,
                joinedRoom:
                    currentNamespace.path === '/admin' ? adminControlRoom.name : lobbyRoom.name,
            })
        })
    } else {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
        socket.destroy()
        io.logger.warn(`Відхилено спробу WebSocket з'єднання до невідомого шляху: ${pathname}`)
    }
})

// 7. Запуск HTTP-сервера
server.listen(PORT, () => {
    console.info(`HTTP та WebSocket сервер слухає на порту ${PORT}`)
    console.info(`Тестуйте за допомогою wscat:`)
    console.info(
        `  Неймспейс за замовчуванням: npx wscat -c ws://localhost:${PORT}/ -H "X-User-Id: user1" -H "X-User-Name: Alice"`,
    )
    console.info(
        `  Ігровий неймспейс: npx wscat -c ws://localhost:${PORT}/game -H "X-User-Id: user2" -H "X-User-Name: Bob"`,
    )
    console.info(
        `  Неймспейс адміністратора: npx wscat -c ws://localhost:${PORT}/admin -H "X-User-Id: admin1" -H "X-User-Name: CharlieAdmin"`,
    )
    console.info(
        `  Підключіть ще одного клієнта для Користувача1 (Alice) з нового терміналу: npx wscat -c ws://localhost:${PORT}/ -H "X-User-Id: user1" -H "X-User-Name: Alice Mobile"`,
    )
    console.info(`  Використовуйте HTML-файл для інтерактивного тестування.`)
})

// Обробка завершення роботи сервера
process.on('SIGINT', () => {
    console.warn('Отримано сигнал SIGINT. Закриття сервера...')
    io.destroy() // Знищити нашу систему
    wss.close(() => {
        console.info('WebSocket сервер закрито.')
        server.close(() => {
            console.info('HTTP сервер закрито. Вихід.')
            process.exit(0)
        })
    })
})
