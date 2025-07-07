// src/index.js

import http from 'http'
import WSServer from './WSServer.js'
import { logger } from './utils/logger.js'
import { generateToken, verifyToken } from './utils/auth.js'

// Створюємо HTTP сервер, який буде слухати наші WebSockets, а також надасть ендпоінт для генерації токенів.
const httpServer = http.createServer((req, res) => {
    // Дуже простий HTTP endpoint для генерації токенів для тестування
    if (req.url.startsWith('/generate-token')) {
        const url = new URL(req.url, `http://${req.headers.host}`)
        const userId =
            url.searchParams.get('userId') || `user_${Math.random().toString(36).substring(2, 7)}`
        const isAdmin = url.searchParams.get('admin') === 'true'

        const payload = { userId: userId, roles: isAdmin ? ['user', 'admin'] : ['user'] }
        const token = generateToken(payload)

        if (token) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ token: token, user: payload }))
        } else {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Failed to generate token' }))
        }
        return
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('WebSocket server running. Connect via WebSocket client.\n')
})

const PORT = process.env.PORT || 3000

// Ініціалізуємо наш WebSocket сервер, передаючи йому HTTP сервер
const wsServer = new WSServer({ server: httpServer })

// --- КОНФІГУРАЦІЯ АВТЕНТИФІКАЦІЇ ТА MIDDLEWARE ДЛЯ ПРОСТОРІВ ІМЕН ---

// 1. Кореневий простір імен '/': автентифікація НЕ потрібна (за замовчуванням).
const rootNamespace = wsServer.of('/')

// Middleware для кореневого простору
rootNamespace.useConnection(async (client, next) => {
    logger.info(
        `[Root NS Connection Middleware] Client ${client.id} connected. User: ${client.user.userId}`,
    )
    // Додаємо timestamp до об'єкта клієнта
    client.connectedAt = new Date()
    // Можна відхилити підключення, якщо потрібно:
    // if (client.user.userId === 'bannedUser') {
    //     logger.warn(`Banned user ${client.user.userId} tried to connect.`);
    //     return next(new Error('You are banned from this server.'));
    // }
    next()
})

rootNamespace.useMessage(async (client, message, next) => {
    logger.debug(
        `[Root NS Message Middleware] Received message from ${client.user.userId}:`,
        message,
    )
    // Можна змінити повідомлення:
    if (message.data && typeof message.data.text === 'string') {
        message.data.text = message.data.text.trim()
        // Запобігаємо порожнім повідомленням
        if (message.data.text === '') {
            logger.warn(
                `[Root NS Message Middleware] Blocking empty message from ${client.user.userId}`,
            )
            return // Не передаємо далі в обробники
        }
    }
    next()
})

rootNamespace.on('connection', (client) => {
    logger.info(
        `Global/Root NS: Client ${client.id} (User: ${
            client.user.userId
        }, Roles: ${client.user.roles.join(',')}) connected.`,
    )
    client.send('globalWelcome', {
        message: `Hello, ${client.user.userId} from the root namespace!`,
    })

    client.on('message', (message) => {
        logger.debug(
            `Global/Root NS: Client ${client.id} (User: ${client.user.userId}) received generic message:`,
            message,
        )
    })

    client.on('disconnect', (code, reason) => {
        logger.info(
            `Global/Root NS: Client ${client.id} (User: ${client.user.userId}) disconnected (Code: ${code}, Reason: ${reason})`,
        )
    })

    client.on('error', (error) => {
        logger.error(
            `Global/Root NS: Client ${client.id} (User: ${client.user.userId}) error:`,
            error,
        )
    })
})

// 2. Простір імен для чату '/chat': автентифікація ОБОВ'ЯЗКОВА.
const chatNamespace = wsServer.of('/chat', { authRequired: true })

// Middleware для чат-простору
chatNamespace.useConnection(async (client, next) => {
    logger.info(
        `[Chat NS Connection Middleware] Client ${client.id} (User: ${client.user.userId}) connected to chat.`,
    )
    // Тут можна перевіряти, чи є у користувача доступ до чату, чи не заблокований він
    next()
})

chatNamespace.useMessage(async (client, message, next) => {
    logger.debug(`[Chat NS Message Middleware] Message from ${client.user.userId}:`, message)
    // Приклад: Перевірка, чи повідомлення про чат містить заборонені слова
    if (message.event === 'chatMessage' && message.data && message.data.text) {
        const forbiddenWords = ['badword1', 'badword2']
        const lowerCaseText = message.data.text.toLowerCase()
        for (const word of forbiddenWords) {
            if (lowerCaseText.includes(word)) {
                logger.warn(
                    `[Chat NS Message Middleware] Blocking forbidden word from ${client.user.userId}: ${message.data.text}`,
                )
                client.send('error', { message: 'Your message contains forbidden words.' })
                return // Зупиняємо обробку повідомлення
            }
        }
    }
    next()
})

chatNamespace.on('connection', (client) => {
    logger.info(
        `Chat NS: Client ${client.id} (User: ${client.user.userId}, Roles: ${client.user.roles.join(
            ',',
        )}) connected.`,
    )
    client.send('welcome', { message: `Welcome, ${client.user.userId} to the chat room!` })

    // Приклад використання кімнати з автоматичними оновленнями
    const lobbyRoom = chatNamespace.room('lobby', {
        updateCallback: async (roomName, activeClients) => {
            const connectedUserIds = Array.from(activeClients).map((c) => c.user.userId)
            logger.debug(
                `[UpdateCallback: ${roomName}] Оновлення для ${
                    activeClients.size
                } клієнтів. Користувачі: ${connectedUserIds.join(', ')}`,
            )
            return {
                timestamp: new Date().toISOString(),
                roomName: roomName,
                activeUsersCount: activeClients.size,
                userIDs: connectedUserIds,
                message: `Periodic update for room '${roomName}'`,
            }
        },
        updateIntervalMs: 5000,
        runInitialUpdate: true,
    })

    const generalRoom = chatNamespace.room('general')
    generalRoom.addClient(client)
    client.send('joinedRoom', 'general')
    generalRoom.broadcast(
        'userJoined',
        { userId: client.user.userId, clientId: client.id, roomId: 'general' },
        client,
    )

    lobbyRoom.addClient(client)
    client.send('joinedRoom', 'lobby')
    lobbyRoom.broadcast(
        'userJoined',
        { userId: client.user.userId, clientId: client.id, roomId: 'lobby' },
        client,
    )

    client.on('message', (message) => {
        logger.info(`Chat NS: Client ${client.id} (User: ${client.user.userId}) received:`, message)
        if (
            message.event === 'chatMessage' &&
            message.data &&
            message.data.text &&
            message.data.roomId
        ) {
            const room = chatNamespace.rooms.get(message.data.roomId)
            if (room && client.isInRoom(message.data.roomId)) {
                room.broadcast(
                    'chatMessage',
                    {
                        senderId: client.id,
                        userId: client.user.userId,
                        message: message.data.text,
                        roomId: message.data.roomId,
                    },
                    client,
                )
            } else {
                client.send('error', { message: 'Invalid room or you are not in this room.' })
            }
        } else if (message.event === 'joinRoom' && typeof message.data === 'string') {
            const roomToJoin = chatNamespace.room(message.data)
            roomToJoin.addClient(client)
            client.send('joinedRoom', message.data)
            roomToJoin.broadcast(
                'userJoined',
                { userId: client.user.userId, clientId: client.id, roomId: message.data },
                client,
            )
            logger.info(
                `Client ${client.id} (User: ${client.user.userId}) dynamically joined room ${message.data} in namespace ${chatNamespace.path}`,
            )
        } else if (message.event === 'leaveRoom' && typeof message.data === 'string') {
            const roomToLeave = chatNamespace.rooms.get(message.data)
            if (roomToLeave && client.isInRoom(message.data)) {
                roomToLeave.removeClient(client)
                client.send('leftRoom', message.data)
                if (chatNamespace.rooms.has(message.data)) {
                    roomToLeave.broadcast(
                        'userLeft',
                        { userId: client.user.userId, clientId: client.id, roomId: message.data },
                        client,
                    )
                }
            } else {
                client.send('error', { message: 'Room not found or you are not in this room.' })
            }
        }
    })

    client.on('disconnect', (code, reason) => {
        logger.info(
            `Chat NS: Client ${client.id} (User: ${client.user.userId}) disconnected (Code: ${code}, Reason: ${reason})`,
        )
    })
})

// 3. Простір імен для адмін-панелі '/admin': ОБОВ'ЯЗКОВА автентифікація + КАСТОМНА СТРАТЕГІЯ.
const adminNamespace = wsServer.of('/admin', {
    authRequired: true,
    authStrategy: async (token, ws, request) => {
        if (!token) {
            logger.warn('Custom admin strategy: Token missing.')
            return null
        }
        const user = verifyToken(token)
        if (!user) {
            logger.warn('Custom admin strategy: Invalid token.')
            return null
        }
        const url = new URL(request.url, `http://${request.headers.host}`)
        const secretKey = url.searchParams.get('secretKey')

        if (!secretKey || secretKey !== 'mySuperAdminSecret') {
            logger.warn(
                `Custom admin strategy: User ${user.userId} tried to connect without correct secretKey.`,
            )
            return null
        }

        if (!user.roles || !user.roles.includes('admin')) {
            logger.warn(
                `Custom admin strategy: User ${user.userId} has valid token but no 'admin' role.`,
            )
            return null
        }

        logger.info(`Custom admin strategy: User ${user.userId} authenticated successfully.`)
        return user
    },
})

// Middleware для адмін-простору
adminNamespace.useConnection(async (client, next) => {
    logger.info(
        `[Admin NS Connection Middleware] Admin Client ${client.id} (User: ${client.user.userId}) connected.`,
    )
    // Додаємо інформацію про адмінські права
    client.isAdmin = true
    next()
})

adminNamespace.useMessage(async (client, message, next) => {
    logger.warn(`[Admin NS Message Middleware] Admin ${client.user.userId} sent:`, message)
    // Приклад: Тільки адмін може надсилати повідомлення типу 'systemCommand'
    if (
        message.event === 'systemCommand' &&
        (!client.user.roles || !client.user.roles.includes('admin'))
    ) {
        logger.warn(
            `[Admin NS Message Middleware] Non-admin user ${client.user.userId} tried to send systemCommand.`,
        )
        client.send('error', { message: 'You are not authorized to send system commands.' })
        return
    }
    next()
})

adminNamespace.on('connection', (client) => {
    logger.info(
        `Admin NS: Client ${client.id} (User: ${
            client.user.userId
        }, Roles: ${client.user.roles.join(',')}) connected.`,
    )
    client.send('welcome', { message: `Welcome, admin ${client.user.userId}!` })

    client.on('message', (message) => {
        logger.info(
            `Admin NS: Client ${client.id} (User: ${client.user.userId}) received:`,
            message,
        )
        if (message.event === 'systemInfoRequest') {
            client.send('systemInfo', {
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                connectedClients: wsServer.getAllClients().length,
                adminRequestBy: client.user.userId,
            })
        }
        // Додатковий обробник для systemCommand
        else if (message.event === 'systemCommand' && message.data && message.data.command) {
            logger.info(`Admin ${client.user.userId} executed command: ${message.data.command}`)
            client.send('commandResult', {
                status: 'success',
                command: message.data.command,
                result: `Executed ${message.data.command}`,
            })
        }
    })
})

// Запускаємо HTTP сервер
httpServer.listen(PORT, () => {
    logger.info(`HTTP server listening on port ${PORT}`)
    logger.info(`WebSocket server accessible at ws://localhost:${PORT}`)
    logger.info(`--- Тестування з Middleware ---`)
    logger.info(
        `Отримати токен для звичайного користувача: http://localhost:${PORT}/generate-token?userId=user123`,
    )
    logger.info(
        `Отримати токен для адміна: http://localhost:${PORT}/generate-token?userId=admin456&admin=true`,
    )
    logger.info(` `)
    logger.info(`** Тест Root Namespace (без auth, з middleware): **`)
    logger.info(
        `  - З'єднання: ws://localhost:${PORT}/?token=YOUR_VALID_TOKEN (перевірте лог на "Connection Middleware")`,
    )
    logger.info(
        `  - Повідомлення: wsRootAuth.send(JSON.stringify({ event: 'chatMessage', data: { text: '  My message  ' } })); (перевірте, чи обрізаються пробіли)`,
    )
    logger.info(
        `  - Порожнє повідомлення: wsRootAuth.send(JSON.stringify({ event: 'chatMessage', data: { text: '   ' } })); (повинно бути заблоковано)`,
    )
    logger.info(` `)
    logger.info(`** Тест Chat Namespace (auth required, з middleware): **`)
    logger.info(`  - З'єднання: ws://localhost:${PORT}/chat?token=YOUR_VALID_TOKEN`)
    logger.info(
        `  - Повідомлення: wsChatAuth.send(JSON.stringify({ event: 'chatMessage', data: { text: 'Hello, everyone!' } }));`,
    )
    logger.info(
        `  - Заборонене слово: wsChatAuth.send(JSON.stringify({ event: 'chatMessage', data: { text: 'This is a badword1.' } })); (повинно бути заблоковано)`,
    )
    logger.info(` `)
    logger.info(`** Тест Admin Namespace (auth required, custom strategy, з middleware): **`)
    logger.info(
        `  - З'єднання: ws://localhost:${PORT}/admin?token=YOUR_ADMIN_TOKEN&secretKey=mySuperAdminSecret`,
    )
    logger.info(
        `  - Команда адміна: wsAdminAuth.send(JSON.stringify({ event: 'systemCommand', data: { command: 'restart' } }));`,
    )
    logger.info(
        `  - Звичайний користувач намагається надіслати команду (повинно бути заблоковано): wsChatAuth.send(JSON.stringify({ event: 'systemCommand', data: { command: 'shutdown' } }));`,
    )
})

// Обробка завершення роботи
process.on('SIGINT', async () => {
    logger.info('\nShutting down server...')
    await wsServer.close()
    httpServer.close(() => {
        logger.info('HTTP server closed.')
        process.exit(0)
    })
})
