// server.js
import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { v4 as uuidv4 } from 'uuid'
import winston from 'winston'
import RoomManager from './RoomManager.js'

import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config()

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
    console.error(
        'Помилка: JWT_SECRET не встановлено. Будь ласка, створіть файл .env з JWT_SECRET=ваш_секретний_ключ',
    )
    process.exit(1)
}

const appLogger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`),
    ),
    transports: [new winston.transports.Console()],
})

const app = express()
const server = createServer(app)
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(express.static('public'))

app.post('/auth', (req, res) => {
    const { username, password } = req.body

    if (username === 'testuser' && password === 'testpass') {
        const payload = {
            userId: uuidv4(),
            username: username,
            roles: ['user'],
        }

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' })
        appLogger.info(`Видано JWT для користувача: ${username}`)
        res.json({ token })
    } else {
        appLogger.warn(`Невдала спроба автентифікації для користувача: ${username}`)
        res.status(401).json({ message: 'Невірний логін або пароль' })
    }
})

const namespaceManagers = new Map()

function getNamespaceManager(namespace) {
    if (!namespaceManagers.has(namespace)) {
        appLogger.info(`Створюємо RoomManager для неймспейсу: /ws/${namespace}`)
        namespaceManagers.set(namespace, new RoomManager(appLogger))
    }
    return namespaceManagers.get(namespace)
}

const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (request, socket, head) => {
    const pathname = request.url
    const WS_PREFIX = '/ws/' // Визначений префікс для WebSocket-з'єднань

    // --- ОНОВЛЕНА ЛОГІКА ПАРСИНГУ НЕЙМСПЕЙСУ ---
    let namespace = null
    if (pathname.startsWith(WS_PREFIX)) {
        const remainingPath = pathname.substring(WS_PREFIX.length) // Отримуємо частину після /ws/
        const parts = remainingPath.split('?')[0].split('/') // Прибираємо параметри запиту та розбиваємо по слешу
        if (parts.length > 0 && parts[0] !== '') {
            namespace = parts[0] // Перша частина після /ws/ буде неймспейсом
        }
    }

    if (!namespace) {
        appLogger.warn(
            `Відхилено WebSocket підключення: Неправильний або відсутній неймспейс у URL '${pathname}'. Очікується формат /ws/<namespace>`,
        )
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
        socket.destroy()
        return
    }

    // Дозволені неймспейси
    const allowedNamespaces = ['chat', 'game', 'admin']
    if (!allowedNamespaces.includes(namespace)) {
        appLogger.warn(
            `Недозволений неймспейс '${namespace}' у URL '${pathname}'. Відхиляємо підключення.`,
        )
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
        socket.destroy()
        return
    }

    let token = null
    const authHeader = request.headers['authorization']
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1]
    } else {
        const urlParams = new URLSearchParams(pathname.split('?')[1])
        token = urlParams.get('token')
    }

    if (!token) {
        appLogger.warn(`Відхилено WebSocket підключення до /ws/${namespace}: Токен не надано.`)
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET)
        appLogger.debug(`JWT успішно верифіковано для ${decoded.username} (ID: ${decoded.userId})`)

        // Перевірка авторизації для неймспейсу на основі ролей
        if (namespace === 'admin' && !decoded.roles.includes('admin')) {
            appLogger.warn(
                `Відхилено WebSocket підключення для ${decoded.username} до адмін-неймспейсу: Недостатньо прав.`,
            )
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
            socket.destroy()
            return
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
            ws.id = decoded.userId
            ws.username = decoded.username
            ws.roles = decoded.roles
            ws.namespace = namespace // Зберігаємо чистий неймспейс без префіксу

            appLogger.info(
                `Клієнт ${ws.username} (ID: ${ws.id}, Roles: ${ws.roles.join(
                    ', ',
                )}) підключився до неймспейсу: /ws/${ws.namespace}`,
            )

            const currentRoomManager = getNamespaceManager(ws.namespace)

            ws.send(
                JSON.stringify({
                    type: 'system_message',
                    content: `Ласкаво просимо, ${ws.username}! Ви підключені до /ws/${ws.namespace}. Будь ласка, приєднайтеся до кімнати.`,
                }),
            )

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

                // Приклад: додаткові перевірки авторизації на основі ролей
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
                                        content: `Ви приєдналися до кімнати '${roomName}' у /ws/${ws.namespace}.`,
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
                                        content: `Ви покинули кімнату '${leaveRoomName}' у /ws/${ws.namespace}.`,
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
            `Відхилено WebSocket підключення до /ws/${namespace}: Недійсний або прострочений токен. Помилка: ${err.message}`,
        )
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
    }
})

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
        `WebSocket сервер готовий до підключень на ws://localhost:${PORT}/ws/<namespace>?token=<jwt_token>`,
    )
    appLogger.info(
        `Для отримання токену: POST http://localhost:${PORT}/auth з { "username": "testuser", "password": "testpass" }`,
    )
})
