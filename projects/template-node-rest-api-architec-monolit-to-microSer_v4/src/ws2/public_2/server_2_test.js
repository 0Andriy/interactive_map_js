// server.js (приклад архітектури з кількома RoomManager)
import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { v4 as uuidv4 } from 'uuid'
import winston from 'winston'
import RoomManager from './RoomManager.js' // Ваш клас RoomManager

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

app.use(express.static('public'))

// --- Мапа для зберігання екземплярів RoomManager за неймспейсами ---
const namespaceManagers = new Map() // Key: namespace (string), Value: RoomManager instance

// Функція для отримання або створення RoomManager для певного неймспейсу
function getNamespaceManager(namespace) {
    if (!namespaceManagers.has(namespace)) {
        appLogger.info(`Створюємо RoomManager для неймспейсу: /${namespace}`)
        namespaceManagers.set(namespace, new RoomManager(appLogger))
    }
    return namespaceManagers.get(namespace)
}

// --- WebSocket сервер ---
const wss = new WebSocketServer({ noServer: true }) // Важливо: відключаємо автоматичне підключення до HTTP-сервера

// Обробка "upgrade" запитів від HTTP сервера
server.on('upgrade', (request, socket, head) => {
    // Приклад URL: ws://localhost:3000/chat, ws://localhost:3000/game/lobby
    const pathname = request.url
    // Витягуємо неймспейс з URL. Наприклад: /chat -> chat, /game/lobby -> game_lobby (або просто game)
    // Тут ми робимо просте розділення за першим слешем, але можна і складніше.
    let namespace = 'default' // Неймспейс за замовчуванням
    const pathParts = pathname.split('/').filter((part) => part) // Розбиваємо на частини та прибираємо порожні

    if (pathParts.length > 0) {
        namespace = pathParts[0] // Перша частина URL як неймспейс
        // Можна також зробити `namespace = pathParts.join('_')` для більш унікальних неймспейсів
    }

    // Перевірка неймспейсів, якщо необхідно (наприклад, дозволені неймспейси)
    const allowedNamespaces = ['chat', 'game', 'admin']
    if (!allowedNamespaces.includes(namespace) && namespace !== 'default') {
        appLogger.warn(`Недозволений неймспейс: ${namespace}. Відхиляємо підключення.`)
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
        socket.destroy()
        return
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
        // Тепер у нас є ws (WebSocket клієнт) та namespace
        ws.id = uuidv4()
        ws.username = `User-${ws.id.substring(0, 4)}`
        ws.namespace = namespace // Зберігаємо неймспейс на об'єкті ws для подальшого використання

        appLogger.info(`Клієнт ${ws.username} підключився до неймспейсу: /${ws.namespace}`)

        // Отримуємо або створюємо RoomManager для цього неймспейсу
        const currentRoomManager = getNamespaceManager(ws.namespace)

        // Додаємо початкове повідомлення та обробники
        ws.send(
            JSON.stringify({
                type: 'system_message',
                content: `Ласкаво просимо, ${ws.username}! Ви підключені до /${ws.namespace}. Будь ласка, приєднайтеся до кімнати.`,
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
                ws.send(JSON.stringify({ type: 'error', message: 'Невірний формат повідомлення.' }))
                return
            }

            appLogger.debug(
                `[${ws.namespace}] Отримано: ${JSON.stringify(parsedMessage)} від ${ws.username}`,
            )

            switch (parsedMessage.type) {
                case 'join_room':
                    const roomName = parsedMessage.roomName
                    if (roomName) {
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
                            ws.currentRoom = roomName // Зберігаємо поточну кімнату для клієнта
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
                    const targetRoom = ws.currentRoom // Використовуємо кімнату, до якої клієнт приєднався
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
                        JSON.stringify({ type: 'error', message: 'Невідомий тип повідомлення.' }),
                    )
                    break
            }
        })

        // Цей обробник `close` все ще потрібен, щоб `ws` бібліотека знала, коли об'єкт "закривається".
        // Але головне видалення з кімнат тепер відбувається всередині `RoomManager` завдяки on('close')
        // зареєстрованому в `joinRoom`.
        ws.on('close', () => {
            appLogger.info(`[${ws.namespace}] Клієнт ${ws.username} відключився.`)
        })

        ws.on('error', (error) => {
            appLogger.error(
                `[${ws.namespace}] Помилка WebSocket для клієнта ${ws.username}: ${error.message}`,
            )
        })

        // Додаємо клієнта до спільноти wss (для загального відстеження, якщо потрібно)
        // wss.clients.add(ws); // wss.handleUpgrade автоматично додає клієнтів
    })
})

// Глобальна розсилка (тепер може бути прив'язана до конкретного неймспейсу або робити розсилку по всіх)
setInterval(() => {
    // Приклад: глобальне оголошення тільки для неймспейсу 'chat'
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

    // Приклад: глобальне оголошення для ВСІХ неймспейсів (якщо потрібно)
    // for (const [ns, manager] of namespaceManagers.entries()) {
    //     const globalMessage = {
    //         type: 'global_announcement',
    //         content: `[ГЛОБАЛЬНО] Оголошення для /${ns}. Користувачів: ${manager.clientRoomMap.size}`
    //     };
    //     manager.broadcastToAllClients(globalMessage);
    // }
}, 15000)

server.listen(PORT, () => {
    appLogger.info(`Сервер запущено на http://localhost:${PORT}`)
    appLogger.info(`WebSocket сервер готовий до підключень на ws://localhost:${PORT}/<namespace>`)
})
