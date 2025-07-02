// server.js
import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { v4 as uuidv4 } from 'uuid'
import winston from 'winston'
import RoomManager from './RoomManager.js'

// --- Додані імпорти для JWT та dotenv ---
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config() // Завантажуємо змінні середовища з .env

// Отримуємо секретний ключ з змінних середовища
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
    console.error(
        'Помилка: JWT_SECRET не встановлено. Будь ласка, створіть файл .env з JWT_SECRET=ваш_секретний_ключ',
    )
    process.exit(1) // Виходимо з процесу, якщо секретний ключ не встановлено
}

// --- Налаштування логера (Winston) ---
const appLogger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`),
    ),
    transports: [new winston.transports.Console()],
})

// --- Ініціалізація Express та HTTP сервера ---
const app = express()
const server = createServer(app)
const PORT = process.env.PORT || 3000

// Middleware для парсингу JSON тіла запитів (для маршруту автентифікації)
app.use(express.json())
// Віддача статичних файлів з папки 'public'
app.use(express.static('public'))

// --- Маршрут для автентифікації та видачі JWT ---
// Це простий приклад. У реальному застосунку тут була б перевірка логіна/пароля в базі даних.
app.post('/auth', (req, res) => {
    const { username, password } = req.body

    // ВАЖЛИВО: Це лише ДЕМО-автентифікація.
    // У реальному застосунку ви б перевіряли username і password
    // проти бази даних або іншої системи ідентифікації.
    if (username === 'testuser' && password === 'testpass') {
        const payload = {
            userId: uuidv4(), // Унікальний ID користувача
            username: username,
            roles: ['user'], // Приклад ролей
            // Додаткові дані, які ви хочете включити в токен
        }

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' }) // Токен дійсний 1 годину
        appLogger.info(`Видано JWT для користувача: ${username}`)
        res.json({ token })
    } else {
        appLogger.warn(`Невдала спроба автентифікації для користувача: ${username}`)
        res.status(401).json({ message: 'Невірний логін або пароль' })
    }
})

// --- Мапа для зберігання екземплярів RoomManager за неймспейсами ---
const namespaceManagers = new Map()

function getNamespaceManager(namespace) {
    if (!namespaceManagers.has(namespace)) {
        appLogger.info(`Створюємо RoomManager для неймспейсу: /${namespace}`)
        namespaceManagers.set(namespace, new RoomManager(appLogger))
    }
    return namespaceManagers.get(namespace)
}

// --- WebSocket сервер ---
const wss = new WebSocketServer({ noServer: true })

// Обробка "upgrade" запитів від HTTP сервера
server.on('upgrade', (request, socket, head) => {
    const pathname = request.url
    let namespace = 'default'
    const pathParts = pathname.split('/').filter((part) => part)

    if (pathParts.length > 0) {
        namespace = pathParts[0]
    }

    // Дозволені неймспейси
    const allowedNamespaces = ['chat', 'game', 'admin']
    if (!allowedNamespaces.includes(namespace) && namespace !== 'default') {
        appLogger.warn(`Недозволений неймспейс: ${namespace}. Відхиляємо підключення.`)
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
        socket.destroy()
        return
    }

    // --- Перевірка JWT токену ---
    // Токен очікується в заголовку 'Authorization' як 'Bearer <token>'
    // Або як параметр запиту '?token=<token>'
    let token = null
    const authHeader = request.headers['authorization']
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1]
    } else {
        const urlParams = new URLSearchParams(pathname.split('?')[1])
        token = urlParams.get('token')
    }

    if (!token) {
        appLogger.warn(`Відхилено WebSocket підключення до /${namespace}: Токен не надано.`)
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) // Верифікація токену
        appLogger.debug(`JWT успішно верифіковано для ${decoded.username} (ID: ${decoded.userId})`)

        // Якщо токен дійсний, продовжуємо встановлення WebSocket з'єднання
        wss.handleUpgrade(request, socket, head, (ws) => {
            // Додаємо дані з JWT до об'єкта WebSocket
            ws.id = decoded.userId
            ws.username = decoded.username
            ws.roles = decoded.roles // Якщо є ролі
            ws.namespace = namespace

            appLogger.info(
                `Клієнт ${ws.username} (ID: ${ws.id}, Roles: ${ws.roles.join(
                    ', ',
                )}) підключився до неймспейсу: /${ws.namespace}`,
            )

            const currentRoomManager = getNamespaceManager(ws.namespace)

            ws.send(
                JSON.stringify({
                    type: 'system_message',
                    content: `Ласкаво просимо, ${ws.username}! Ви підключені до /${ws.namespace}. Будь ласка, приєднайтеся до кімнати.`,
                }),
            )

            // Обробка вхідних повідомлень
            ws.on('message', (message) => {
                let parsedMessage
                try {
                    parsedMessage = JSON.parse(message.toString())
                } catch (e) {
                    appLogger.warn(
                        `[${ws.namespace}] Невірний JSON від клієнта ${
                            ws.username
                        }: ${message.toString()}`,
                    )
                    ws.send(
                        JSON.stringify({ type: 'error', message: 'Невірний формат повідомлення.' }),
                    )
                    return
                }

                appLogger.debug(
                    `[${ws.namespace}] Отримано: ${JSON.stringify(parsedMessage)} від ${
                        ws.username
                    }`,
                )

                // --- Додаткові перевірки авторизації на основі ролей (приклад) ---
                if (parsedMessage.type === 'admin_action' && !ws.roles.includes('admin')) {
                    ws.send(
                        JSON.stringify({
                            type: 'error',
                            message: 'Недостатньо прав для цієї дії.',
                        }),
                    )
                    appLogger.warn(`Клієнт ${ws.username} спробував виконати адмін-дію без прав.`)
                    return
                }

                switch (parsedMessage.type) {
                    case 'join_room':
                        const roomName = parsedMessage.roomName
                        if (roomName) {
                            // Приклад: дозволити вхід до кімнати 'private_admin_room' лише адмінам
                            if (roomName === 'private_admin_room' && !ws.roles.includes('admin')) {
                                ws.send(
                                    JSON.stringify({
                                        type: 'error',
                                        message: `Доступ до кімнати '${roomName}' заборонено.`,
                                    }),
                                )
                                appLogger.warn(
                                    `Користувач ${ws.username} (ролі: ${ws.roles.join(
                                        ', ',
                                    )}) спробував приєднатися до закритої кімнати '${roomName}'.`,
                                )
                                return
                            }

                            const updateCallback = async (name, clients) => ({
                                type: 'room_update',
                                message: `Користувачі в кімнаті '${name}': ${Array.from(clients)
                                    .map((c) => c.username)
                                    .join(', ')}`,
                                users: Array.from(clients).map((c) => c.username),
                            })
                            const joined = currentRoomManager.joinRoom(
                                roomName,
                                ws,
                                updateCallback,
                                5000,
                                true,
                            )
                            if (joined) {
                                ws.send(
                                    JSON.stringify({
                                        type: 'system_message',
                                        content: `Ви приєдналися до кімнати '${roomName}' у /${ws.namespace}.`,
                                    }),
                                )
                                currentRoomManager.sendMessageToRoom(roomName, {
                                    type: 'system_message',
                                    content: `${ws.username} приєднався до кімнати ${roomName}.`,
                                })
                                ws.currentRoom = roomName
                            } else {
                                ws.send(
                                    JSON.stringify({
                                        type: 'error',
                                        message: `Не вдалося приєднатися до кімнати '${roomName}'.`,
                                    }),
                                )
                            }
                        } else {
                            ws.send(
                                JSON.stringify({
                                    type: 'error',
                                    message: 'Будь ласка, вкажіть roomName.',
                                }),
                            )
                        }
                        break
                    case 'chat_message':
                        const content = parsedMessage.content
                        const targetRoom = ws.currentRoom
                        if (targetRoom && content) {
                            const chatMessage = {
                                type: 'chat_message',
                                sender: ws.username,
                                content: content,
                            }
                            currentRoomManager.sendMessageToRoom(targetRoom, chatMessage)
                        } else {
                            ws.send(
                                JSON.stringify({
                                    type: 'error',
                                    message:
                                        'Ви маєте приєднатися до кімнати, щоб надсилати повідомлення.',
                                }),
                            )
                        }
                        break
                    case 'leave_room':
                        const leaveRoomName = parsedMessage.roomName || ws.currentRoom
                        if (leaveRoomName) {
                            const left = currentRoomManager.leaveRoom(leaveRoomName, ws)
                            if (left) {
                                ws.send(
                                    JSON.stringify({
                                        type: 'system_message',
                                        content: `Ви покинули кімнату '${leaveRoomName}' у /${ws.namespace}.`,
                                    }),
                                )
                                delete ws.currentRoom
                            } else {
                                ws.send(
                                    JSON.stringify({
                                        type: 'error',
                                        message: `Не вдалося покинути кімнату '${leaveRoomName}'.`,
                                    }),
                                )
                            }
                        } else {
                            ws.send(
                                JSON.stringify({
                                    type: 'error',
                                    message: 'Будь ласка, вкажіть roomName для виходу.',
                                }),
                            )
                        }
                        break
                    default:
                        ws.send(
                            JSON.stringify({
                                type: 'error',
                                message: 'Невідомий тип повідомлення.',
                            }),
                        )
                        break
                }
            })

            ws.on('close', () => {
                appLogger.info(`[${ws.namespace}] Клієнт ${ws.username} відключився.`)
            })

            ws.on('error', (error) => {
                appLogger.error(
                    `[${ws.namespace}] Помилка WebSocket для клієнта ${ws.username}: ${error.message}`,
                )
            })
        })
    } catch (err) {
        appLogger.warn(
            `Відхилено WebSocket підключення до /${namespace}: Недійсний або прострочений токен. Помилка: ${err.message}`,
        )
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
    }
})

// Глобальна розсилка (якщо потрібно)
setInterval(() => {
    const chatManager = namespaceManagers.get('chat')
    if (chatManager) {
        const globalMessage = {
            type: 'global_announcement',
            content: `[ЧАТ ОГОЛОШЕННЯ] Час: ${new Date().toLocaleTimeString(
                'uk-UA',
            )}. Користувачів у чаті: ${chatManager.clientRoomMap.size}`,
        }
        const sentCount = chatManager.broadcastToAllClients(globalMessage)
        appLogger.info(`[CHAT] Надіслано оголошення ${sentCount} клієнтам.`)
    }
}, 15000)

server.listen(PORT, () => {
    appLogger.info(`Сервер запущено на http://localhost:${PORT}`)
    appLogger.info(
        `WebSocket сервер готовий до підключень на ws://localhost:${PORT}/<namespace>?token=<jwt_token>`,
    )
    appLogger.info(
        `Для отримання токену: POST http://localhost:${PORT}/auth з { "username": "testuser", "password": "testpass" }`,
    )
})
