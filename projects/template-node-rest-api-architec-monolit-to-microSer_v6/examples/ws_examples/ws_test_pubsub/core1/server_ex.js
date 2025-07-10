// server.js

import http from 'http'
import { WebSocketServer } from 'ws'
import { parse } from 'url'
import { Server } from './src/core/Server.js'
import { StorageFactory } from './src/storage/StorageFactory.js' // Імпортуємо фабрику
import { URLSearchParams } from 'url' // Додано для сумісності з Node.js 14+

// Для імітації ID інстансу сервера (важливо для Pub/Sub у багатоінстансній архітектурі)
process.env.SERVER_INSTANCE_ID =
    process.env.SERVER_INSTANCE_ID || `instance_${Math.random().toString(36).substring(2, 8)}`

const PORT = process.env.PORT || 8080

// 1. Створення HTTP-сервера
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('WebSocket сервер працює. Підключіться через WebSocket.\n')
})

// 2. Створення WebSocket-сервера
const wss = new WebSocketServer({ noServer: true })

// 3. Ініціалізація нашої системи
// Визначаємо конфігурацію сховища
const storageConfig = {
    // Змініть 'in-memory' на 'redis', коли будете готові перейти
    type: process.env.STORAGE_TYPE || 'in-memory',
    // redis: {
    //     host: process.env.REDIS_HOST || '127.0.0.1',
    //     port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
    //     password: process.env.REDIS_PASSWORD || undefined,
    // },
}

const appLogger = console // Можете використовувати більш досконалий логер тут

// Створюємо екземпляр сховища через фабрику
const stateStorage = StorageFactory.createStorage(storageConfig, appLogger)

// Передаємо сховище до Server
const io = new Server(stateStorage, appLogger)

// Асинхронна ініціалізація сервера (включаючи створення дефолтного неймспейсу)
async function startServer() {
    // Якщо це Redis, потрібно буде підключитися
    // if (storageConfig.type === 'redis') {
    //    const connected = await stateStorage.connect();
    //    if (!connected) {
    //        console.error("Не вдалося підключитися до Redis. Вихід.");
    //        process.exit(1);
    //    }
    // }

    await io.initialize() // Ініціалізувати наш Server

    // Попереднє створення деяких неймспейсів та кімнат
    appLogger.info('Налаштування початкових кімнат...')
    const defaultNamespace = await io.of('/')
    const gameNamespace = await io.of('/game')
    const adminNamespace = await io.of('/admin')

    // Створюємо постійні кімнати з isPersistent = true
    const lobbyRoom = await defaultNamespace.createRoom('lobby', 'Головне лобі', true) // Постійна кімната
    const generalChatRoom = await defaultNamespace.createRoom('global-chat', 'Глобальний чат', true) // Постійна кімната
    const adminControlRoom = await adminNamespace.createRoom(
        'control-room',
        'Панель керування адміністратора',
        true,
    ) // Постійна кімната

    // Додаємо завдання до постійних кімнат
    await lobbyRoom.addTask(
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

    await generalChatRoom.addTask(
        'chatStats',
        async (roomInfo) => {
            roomInfo.sendMessage(`[${roomInfo.name}] З'єднань: ${roomInfo.clients.length}.`, {
                type: 'chat_stats',
            })
        },
        4000,
        true,
    )

    appLogger.info('Визначені кімнати (початкові):')
    const defaultRooms = await defaultNamespace.getAllRooms()
    appLogger.info(
        `  Неймспейс за замовчуванням: ${defaultRooms
            .map((r) => `${r.name} (ID: ${r.id}, Постійна: ${r.isPersistent})`)
            .join(', ')}`,
    )
    const gameRooms = await gameNamespace.getAllRooms()
    appLogger.info(
        `  Ігровий неймспейс: ${gameRooms
            .map((r) => `${r.name} (ID: ${r.id}, Постійна: ${r.isPersistent})`)
            .join(', ')}`,
    )
    const adminRooms = await adminNamespace.getAllRooms()
    appLogger.info(
        `  Неймспейс адміністратора: ${adminRooms
            .map((r) => `${r.name} (ID: ${r.id}, Постійна: ${r.isPersistent})`)
            .join(', ')}`,
    )

    return {
        lobbyRoom,
        generalChatRoom,
        adminControlRoom,
        defaultNamespace,
        gameNamespace,
        adminNamespace,
    }
}

// 4. Обробка WebSocket upgrade запитів
server.on('upgrade', async (request, socket, head) => {
    const { pathname, query } = parse(request.url)
    const normalizedPath =
        pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname

    // Перевірити, чи шлях відповідає одному з наших неймспейсів
    const namespaceExistsInStorage = await io.storage.namespaceExists(normalizedPath)

    if (namespaceExistsInStorage) {
        wss.handleUpgrade(request, socket, head, async (ws) => {
            const currentNamespace = await io.of(normalizedPath)
            const queryParams = new URLSearchParams(query || '') // Ensure query is not null
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
            const client = await io.addClientConnection(connectionId, userId, username, ws)

            io.logger.info(
                `Нове WebSocket з'єднання до Неймспейсу "${currentNamespace.path}" з ${request.socket.remoteAddress}. ID з'єднання клієнта: ${client.id}, Користувач: ${client.username} (ID: ${client.userId})`,
            )

            // Автоматично приєднати клієнтів до кімнати за замовчуванням на основі неймспейсу
            // Отримуємо посилання на кімнати ще раз, бо вони могли бути створені іншим інстансом
            const lobbyRoom = await io.of('/').then((ns) => ns.getRoom('lobby'))
            const adminControlRoom = await io.of('/admin').then((ns) => ns.getRoom('control-room'))

            if (normalizedPath === '/admin' && adminControlRoom) {
                await adminControlRoom.join(client)
            } else if (lobbyRoom) {
                await lobbyRoom.join(client)
            } else {
                io.logger.warn(
                    `Не вдалося приєднати клієнта до кімнати за замовчуванням. Лобі або адмін-кімната не знайдена.`,
                )
            }

            // 5. Обробка повідомлень від клієнта
            ws.on('message', async (message) => {
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

                            let roomForChat = await currentNamespace.getRoom(targetRoomIdChat)

                            if (!roomForChat) {
                                // --- ПРИКЛАД ДИНАМІЧНОГО СТВОРЕННЯ КІМНАТИ (НЕПОСТІЙНА) ---
                                roomForChat = await currentNamespace.createRoom(
                                    targetRoomIdChat,
                                    `Динамічний чат: ${targetRoomIdChat}`,
                                    false,
                                )
                                io.logger.info(
                                    `Динамічно створено кімнату "${roomForChat.name}" (ID: ${roomForChat.id}) у неймспейсі "${currentNamespace.path}" для повідомлення чату. Вона буде видалена, коли стане порожньою.`,
                                )
                            }

                            // Переконатися, що клієнт перебуває в цій кімнаті перед надсиланням повідомлення
                            const clientsInChatRoom = await roomForChat.getClients()
                            if (!clientsInChatRoom.some((c) => c.id === client.id)) {
                                await roomForChat.join(client)
                                client.send({
                                    type: 'info',
                                    message: `Вас автоматично приєднано до кімнати "${roomForChat.name}" для надсилання повідомлень.`,
                                })
                            }

                            await roomForChat.sendMessage(`[${client.username}]: ${text}`, {
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

                            let roomToJoin = await currentNamespace.getRoom(newRoomId)

                            if (!roomToJoin) {
                                // --- ПРИКЛАД ДИНАМІЧНОГО СТВОРЕННЯ КІМНАТИ З УМОВАМИ ---
                                let isNewRoomPersistent = false
                                if (newRoomId === 'vip_lounge') {
                                    // Наприклад, VIP-кімната може бути постійною
                                    isNewRoomPersistent = true
                                }

                                roomToJoin = await currentNamespace.createRoom(
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
                                    await roomToJoin.addTask(
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

                            // Залишити всі поточні кімнати в цьому неймспейсі, які не є постійними
                            // і до яких клієнт приєднаний, перед приєднанням до нової.
                            // Або, в залежності від логіки, залишити ВСІ кімнати.
                            const allCurrentRooms = await currentNamespace.getAllRooms()
                            for (const r of allCurrentRooms) {
                                if (r.id !== roomToJoin.id) {
                                    // Не залишати кімнату, до якої приєднуємося
                                    const clientsInRoom = await r.getClients()
                                    if (clientsInRoom.some((c) => c.id === client.id)) {
                                        await r.leave(client)
                                    }
                                }
                            }

                            await roomToJoin.join(client)
                            client.send({
                                type: 'info',
                                message: `Успішно приєднано до кімнати "${roomToJoin.name}" (ID: ${roomToJoin.id}) у неймспейсі "${currentNamespace.path}".`,
                            })
                            break

                        case 'private_message':
                            const targetUserId = parsedMessage.targetUserId
                            const pmText = parsedMessage.text
                            if (targetUserId && pmText) {
                                await io.sendToUser(
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
            ws.on('close', async () => {
                io.logger.info(
                    `WebSocket з'єднання закрито для ${client.username} (ID: ${client.userId}, З'єднання: ${client.id}).`,
                )
                await io.disconnectClient(client)
            })

            ws.on('error', (error) => {
                io.logger.error(
                    `WebSocket error для ${client.username} (ID: ${client.userId}, З'єднання: ${client.id}): ${error.message}`,
                )
            })

            // Тестове вітальне повідомлення при підключенні
            const currentLobbyRoom = await io
                .of('/')
                .then((ns) => ns.getRoom('lobby'))
                .catch(() => null)
            const currentAdminControlRoom = await io
                .of('/admin')
                .then((ns) => ns.getRoom('control-room'))
                .catch(() => null)

            let joinedRoomName = 'Невідома'
            if (normalizedPath === '/admin' && adminControlRoom) {
                joinedRoomName = adminControlRoom.name
            } else if (lobbyRoom) {
                joinedRoomName = lobbyRoom.name
            }

            client.send({
                type: 'welcome',
                message: `Ласкаво просимо, ${client.username}! Ви підключені до неймспейсу "${currentNamespace.path}". Ваш ID користувача: ${client.userId}. Ваш ID з'єднання: ${client.id}.`,
                joinedRoom: joinedRoomName,
            })
        })
    } else {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
        socket.destroy()
        io.logger.warn(`Відхилено спробу WebSocket з'єднання до невідомого шляху: ${pathname}`)
    }
})

// Запускаємо ініціалізацію сервера та кімнат
startServer()
    .then(() => {
        // 7. Запуск HTTP-сервера
        server.listen(PORT, () => {
            console.info(`HTTP та WebSocket сервер слухає на порту ${PORT}`)
            console.info(`  Server Instance ID: ${process.env.SERVER_INSTANCE_ID}`)
            console.info(`  Storage Type: ${storageConfig.type}`)
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
    })
    .catch((error) => {
        console.error('Помилка при запуску сервера:', error)
        process.exit(1)
    })

// Обробка завершення роботи сервера
process.on('SIGINT', async () => {
    console.warn('Отримано сигнал SIGINT. Закриття сервера...')
    await io.destroy() // Знищити нашу систему (асинхронно)
    wss.close(() => {
        console.info('WebSocket сервер закрито.')
        server.close(() => {
            console.info('HTTP сервер закрито. Вихід.')
            process.exit(0)
        })
    })
})
