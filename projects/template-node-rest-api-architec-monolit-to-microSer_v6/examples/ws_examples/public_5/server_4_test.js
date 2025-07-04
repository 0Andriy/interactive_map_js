// server.js
import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { v4 as uuidv4 } from 'uuid'
import winston from 'winston'
import RoomManager from './RoomManager.js'

import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

// Завантажуємо змінні оточення з файлу .env
dotenv.config()

// Перевірка наявності JWT_SECRET
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
    console.error(
        'Помилка: JWT_SECRET не встановлено. Будь ласка, створіть файл .env з JWT_SECRET=ваш_секретний_ключ',
    )
    process.exit(1) // Завершуємо роботу сервера, якщо секретний ключ відсутній
}

// Налаштування логера за допомогою Winston
const appLogger = winston.createLogger({
    level: 'debug', // Рівень логування: debug, info, warn, error
    format: winston.format.combine(
        winston.format.colorize(), // Додає кольори для виводу в консоль
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // Додає часову мітку
        winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`), // Формат повідомлення
    ),
    transports: [new winston.transports.Console()], // Вивід логів у консоль
})

const app = express()
const server = createServer(app) // Створюємо HTTP сервер з Express
const PORT = process.env.PORT || 3000 // Порт сервера

// Middleware для парсингу JSON тіла запитів
app.use(express.json())
// Middleware для віддачі статичних файлів (HTML, CSS, JS) з папки 'public'
app.use(express.static('public'))

/**
 * Ендпоінт для автентифікації користувачів.
 * Приймає username та password, видає JWT токен.
 */
app.post('/auth', (req, res) => {
    const { username, password } = req.body

    // Проста імітація автентифікації (для демонстрації)
    if (username === 'testuser' && password === 'testpass') {
        const payload = {
            userId: uuidv4(), // Генеруємо унікальний ID користувача
            username: username,
            roles: ['user'], // Ролі користувача
        }

        // Підписуємо JWT токен з корисним навантаженням та секретним ключем, термін дії 1 година
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' })
        appLogger.info(`Видано JWT для користувача: ${username} (ID: ${payload.userId})`)
        res.json({ token })
    } else if (username === 'admin' && password === 'adminpass') {
        const payload = {
            userId: uuidv4(),
            username: username,
            roles: ['user', 'admin'], // Адмін має обидві ролі
        }
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' })
        appLogger.info(`Видано JWT для адміна: ${username} (ID: ${payload.userId})`)
        res.json({ token })
    } else {
        appLogger.warn(`Невдала спроба автентифікації для користувача: ${username}`)
        res.status(401).json({ message: 'Невірний логін або пароль' })
    }
})

// Map для зберігання RoomManager'ів для кожного неймспейсу
// Ключ: назва неймспейсу (наприклад, 'chat', 'game')
// Значення: екземпляр RoomManager для цього неймспейсу
const namespaceManagers = new Map()

/**
 * Повертає або створює RoomManager для заданого неймспейсу.
 * @param {string} namespace - Назва неймспейсу.
 * @returns {RoomManager} Екземпляр RoomManager.
 */
function getNamespaceManager(namespace) {
    if (!namespaceManagers.has(namespace)) {
        appLogger.info(`Створюємо RoomManager для неймспейсу: /ws/${namespace}`)
        namespaceManagers.set(namespace, new RoomManager(appLogger))
    }
    return namespaceManagers.get(namespace)
}

// Створюємо екземпляр WebSocketServer без прив'язки до HTTP сервера одразу (noServer: true)
// Це дозволяє нам вручну обробляти 'upgrade' запити.
const wss = new WebSocketServer({ noServer: true })

/**
 * Обробник HTTP 'upgrade' запитів для встановлення WebSocket-з'єднань.
 * Перехоплює запит, валідує URL та токен, а потім передає його WSS.
 */
server.on('upgrade', (request, socket, head) => {
    const pathname = request.url
    const WS_PREFIX = '/ws/' // Визначений префікс для WebSocket-з'єднань

    let namespace = null
    // Парсимо URL, щоб отримати назву неймспейсу після '/ws/'
    if (pathname.startsWith(WS_PREFIX)) {
        // Отримуємо частину шляху після '/ws/'
        const remainingPath = pathname.substring(WS_PREFIX.length)
        // Розбиваємо залишкову частину на сегменти та беремо перший як неймспейс
        // Прибираємо параметри запиту, якщо вони є
        const parts = remainingPath.split('?')[0].split('/')
        if (parts.length > 0 && parts[0] !== '') {
            namespace = parts[0]
        }
    }

    // Якщо неймспейс не визначено або він порожній, відхиляємо підключення.
    if (!namespace) {
        appLogger.warn(
            `Відхилено WebSocket підключення: Неправильний або відсутній неймспейс у URL '${pathname}'. Очікується формат /ws/<namespace>`,
        )
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
        socket.destroy()
        return
    }

    // Визначення дозволених неймспейсів
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
    // Спробуємо отримати токен з заголовка Authorization (Bearer Token)
    const authHeader = request.headers['authorization']
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1]
    } else {
        // Якщо токена немає в заголовку, шукаємо його в параметрах URL
        const urlParts = pathname.split('?')
        if (urlParts.length > 1) {
            const urlParams = new URLSearchParams(urlParts[1])
            token = urlParams.get('token')
        }
    }

    // Якщо токен не надано, відхиляємо підключення
    if (!token) {
        appLogger.warn(`Відхилено WebSocket підключення до /ws/${namespace}: Токен не надано.`)
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
    }

    try {
        // Верифікація JWT токена
        const decoded = jwt.verify(token, JWT_SECRET)
        appLogger.debug(`JWT успішно верифіковано для ${decoded.username} (ID: ${decoded.userId})`)

        // Перевірка авторизації на рівні неймспейсу (наприклад, доступ до 'admin' тільки для адмінів)
        if (namespace === 'admin' && !decoded.roles.includes('admin')) {
            appLogger.warn(
                `Відхилено WebSocket підключення для ${decoded.username} до адмін-неймспейсу: Недостатньо прав.`,
            )
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
            socket.destroy()
            return
        }

        // Якщо автентифікація та авторизація пройшли успішно, передаємо з'єднання WebSocketServer
        wss.handleUpgrade(request, socket, head, (ws) => {
            // Додаємо метадані користувача до об'єкта WebSocket
            ws.id = decoded.userId
            ws.username = decoded.username
            ws.roles = decoded.roles
            ws.namespace = namespace // Зберігаємо чисту назву неймспейсу

            // Емітуємо подію 'connection' для внутрішньої обробки WSS
            wss.emit('connection', ws, request)
        })
    } catch (err) {
        // Обробка помилок верифікації JWT (недійсний, прострочений токен)
        appLogger.warn(
            `Відхилено WebSocket підключення до /ws/${namespace}: Недійсний або прострочений токен. Помилка: ${err.message}`,
        )
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
    }
})

/**
 * Обробник події 'connection' для WebSocketServer.
 * Тут відбувається вся логіка взаємодії з підключеним клієнтом.
 */
wss.on('connection', (ws) => {
    appLogger.info(
        `Клієнт ${ws.username} (ID: ${ws.id}, Roles: ${ws.roles.join(
            ', ',
        )}) підключився до неймспейсу: /ws/${ws.namespace}`,
    )

    // Отримуємо RoomManager для поточного неймспейсу клієнта
    const currentRoomManager = getNamespaceManager(ws.namespace)

    // Надсилаємо системне повідомлення новому клієнту
    ws.send(
        JSON.stringify({
            type: 'system_message',
            content: `Ласкаво просимо, ${ws.username}! Ви підключені до /ws/${ws.namespace}. Будь ласка, приєднайтеся до кімнати.`,
        }),
    )

    /**
     * Обробник повідомлень, що надходять від клієнта.
     */
    ws.on('message', (message) => {
        let parsedMessage
        try {
            parsedMessage = JSON.parse(message.toString())
        } catch (e) {
            appLogger.warn(
                `[${ws.namespace}] Невірний JSON від клієнта ${ws.username} (ID: ${
                    ws.id
                }): ${message.toString()}`,
            )
            ws.send(JSON.stringify({ type: 'error', message: 'Невірний формат повідомлення.' }))
            return
        }

        // Обробка пінг-понгів
        if (parsedMessage.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }))
            appLogger.debug(`[${ws.namespace}] Відправлено понг клієнту ${ws.username}.`)
            return
        }

        appLogger.debug(
            `[${ws.namespace}] Отримано: ${JSON.stringify(parsedMessage)} від ${ws.username} (ID: ${
                ws.id
            })`,
        )

        // Приклад: додаткові перевірки авторизації на основі ролей для конкретних дій
        if (parsedMessage.type === 'admin_action' && !ws.roles.includes('admin')) {
            ws.send(JSON.stringify({ type: 'error', message: 'Недостатньо прав для цієї дії.' }))
            appLogger.warn(
                `[${ws.namespace}] Клієнт ${ws.username} (ID: ${ws.id}) спробував виконати адмін-дію без прав.`,
            )
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
                            `[${ws.namespace}] Користувач ${ws.username} (ID: ${
                                ws.id
                            }, ролі: ${ws.roles.join(
                                ', ',
                            )}) спробував приєднатися до закритої кімнати '${roomName}'.`,
                        )
                        return
                    }

                    // Колбек для оновлення інформації про кімнату
                    const updateCallback = async (name, clients) => ({
                        type: 'room_update',
                        roomName: name,
                        userCount: clients.size,
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
                        ws.currentRoom = roomName // Зберігаємо поточну кімнату для клієнта
                        appLogger.info(
                            `[${ws.namespace}] Клієнт ${ws.username} (ID: ${ws.id}) приєднався до кімнати '${roomName}'.`,
                        )
                    } else {
                        ws.send(
                            JSON.stringify({
                                type: 'error',
                                message: `Не вдалося приєднатися до кімнати '${roomName}'. Можливо, кімната вже переповнена.`,
                            }),
                        )
                        appLogger.warn(
                            `[${ws.namespace}] Клієнту ${ws.username} (ID: ${ws.id}) не вдалося приєднатися до кімнати '${roomName}'.`,
                        )
                    }
                } else {
                    ws.send(
                        JSON.stringify({ type: 'error', message: 'Будь ласка, вкажіть roomName.' }),
                    )
                }
                break
            case 'chat_message':
                const content = parsedMessage.content
                const targetRoom = ws.currentRoom // Використовуємо кімнату, до якої клієнт приєднався
                if (
                    targetRoom &&
                    content &&
                    typeof content === 'string' &&
                    content.trim().length > 0
                ) {
                    const chatMessage = {
                        type: 'chat_message',
                        sender: ws.username,
                        content: content.trim(),
                    }
                    currentRoomManager.sendMessageToRoom(targetRoom, chatMessage)
                    appLogger.debug(
                        `[${ws.namespace}] Повідомлення від ${ws.username} в кімнату '${targetRoom}': '${content}'`,
                    )
                } else {
                    ws.send(
                        JSON.stringify({
                            type: 'error',
                            message:
                                'Ви маєте приєднатися до кімнати та надати непусте повідомлення.',
                        }),
                    )
                    appLogger.warn(
                        `[${ws.namespace}] Клієнт ${ws.username} спробував надіслати порожнє повідомлення або не приєднаний до кімнати.`,
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
                        currentRoomManager.sendMessageToRoom(leaveRoomName, {
                            type: 'system_message',
                            content: `${ws.username} покинув кімнату ${leaveRoomName}.`,
                        })
                        delete ws.currentRoom // Видаляємо поточну кімнату з об'єкта клієнта
                        appLogger.info(
                            `[${ws.namespace}] Клієнт ${ws.username} (ID: ${ws.id}) покинув кімнату '${leaveRoomName}'.`,
                        )
                    } else {
                        ws.send(
                            JSON.stringify({
                                type: 'error',
                                message: `Не вдалося покинути кімнату '${leaveRoomName}'. Ви, можливо, не були в ній.`,
                            }),
                        )
                        appLogger.warn(
                            `[${ws.namespace}] Клієнту ${ws.username} (ID: ${ws.id}) не вдалося покинути кімнату '${leaveRoomName}'.`,
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
                ws.send(JSON.stringify({ type: 'error', message: 'Невідомий тип повідомлення.' }))
                appLogger.warn(
                    `[${ws.namespace}] Клієнт ${ws.username} надіслав невідомий тип повідомлення: '${parsedMessage.type}'.`,
                )
                break
        }
    })

    /**
     * Обробник події "з'єднання закрито" для конкретного клієнта.
     */
    ws.on('close', (code, reason) => {
        appLogger.info(
            `[${ws.namespace}] Клієнт ${ws.username} (ID: ${
                ws.id
            }) відключився. Код: ${code}, Причина: ${reason || 'Без причини'}.`,
        )
        // Видаляємо клієнта з будь-якої кімнати, в якій він знаходився
        if (ws.currentRoom) {
            currentRoomManager.leaveRoom(ws.currentRoom, ws)
            currentRoomManager.sendMessageToRoom(ws.currentRoom, {
                type: 'system_message',
                content: `${ws.username} відключився та покинув кімнату ${ws.currentRoom}.`,
            })
            appLogger.info(
                `[${ws.namespace}] Клієнт ${ws.username} видалений з кімнати '${ws.currentRoom}'.`,
            )
        }
    })

    /**
     * Обробник події "помилка" для конкретного клієнта.
     */
    ws.on('error', (error) => {
        appLogger.error(
            `[${ws.namespace}] Помилка WebSocket для клієнта ${ws.username} (ID: ${ws.id}): ${error.message}`,
        )
    })
})

// Глобальне оголошення для неймспейсу 'chat' кожні 15 секунд
// Показує, як можна надсилати повідомлення всім клієнтам в певному неймспейсі
setInterval(() => {
    const chatManager = namespaceManagers.get('chat') // Отримуємо RoomManager для 'chat'
    if (chatManager) {
        const globalMessage = {
            type: 'global_announcement',
            content: `[ЧАТ ОГОЛОШЕННЯ] Час: ${new Date().toLocaleTimeString(
                'uk-UA',
            )}. Користувачів у чаті: ${chatManager.getTotalClients()}`,
        }
        const sentCount = chatManager.broadcastToAllClients(globalMessage)
        appLogger.info(`[CHAT] Надіслано оголошення ${sentCount} клієнтам.`)
    }
}, 15000) // Кожні 15 секунд

// Запуск HTTP/WebSocket сервера
server.listen(PORT, () => {
    appLogger.info(`Сервер запущено на http://localhost:${PORT}`)
    appLogger.info(`Ендпоінт автентифікації: POST http://localhost:${PORT}/auth`)
    appLogger.info(
        `WebSocket сервер готовий до підключень на ws://localhost:${PORT}/ws/<namespace>?token=<jwt_token>`,
    )
    appLogger.info(`Тестові облікові дані: { "username": "testuser", "password": "testpass" }`)
    appLogger.info(`Адмін облікові дані: { "username": "admin", "password": "adminpass" }`)
})
