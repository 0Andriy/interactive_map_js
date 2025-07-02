// server.js
// Використовуємо ES Modules

import express from 'express'
import { createServer } from 'http' // Імпортуємо окремо createServer
import { WebSocket, WebSocketServer } from 'ws' // Імпортуємо WebSocket і WebSocketServer
import { v4 as uuidv4 } from 'uuid' // Для унікальних ID клієнтів
import winston from 'winston' // Для логування
import RoomManager from './manager/RoomManager.js' // Змінено шлях та імпорт

// --- Налаштування логера (Winston) ---
const appLogger = winston.createLogger({
    level: 'debug', // 'info', 'warn', 'error', 'debug'
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`),
    ),
    transports: [new winston.transports.Console()],
})

// --- Ініціалізація Express та HTTP сервера ---
const app = express()
const server = createServer(app) // Використовуємо createServer з http

const PORT = process.env.PORT || 3000

// Віддача статичних файлів з папки 'public'
app.use(express.static('public'))

// --- Ініціалізація WebSocket сервера ---
const wss = new WebSocketServer({ server }) // Використовуємо WebSocketServer

// --- Ініціалізація RoomManager ---
const roomManager = new RoomManager(appLogger)

// --- WebSocket події ---
wss.on('connection', (ws) => {
    // Додаємо унікальний ID та псевдонім (за замовчуванням) до об'єкта WebSocket
    // Це дозволить RoomManager краще відстежувати клієнтів.
    ws.id = uuidv4()
    ws.username = `User-${ws.id.substring(0, 4)}` // Короткий ID для зручності
    appLogger.info(`Клієнт підключився: ${ws.username} (ID: ${ws.id})`)

    // Надсилаємо початкове повідомлення клієнту
    ws.send(
        JSON.stringify({
            type: 'system_message',
            content: `Ласкаво просимо, ${ws.username}! Будь ласка, приєднайтеся до кімнати.`,
            userCount: wss.clients.size,
        }),
    )

    // Обробка вхідних повідомлень від клієнта
    ws.on('message', (message) => {
        let parsedMessage
        try {
            // У `ws` бібліотеці, `message` може бути Buffer або ArrayBuffer.
            // toString() перетворює його на рядок.
            parsedMessage = JSON.parse(message.toString())
        } catch (e) {
            appLogger.warn(`Невірний JSON від клієнта ${ws.username}: ${message.toString()}`)
            ws.send(
                JSON.stringify({
                    type: 'error',
                    message: 'Невірний формат повідомлення (очікується JSON).',
                }),
            )
            return
        }

        appLogger.debug(`Отримано: ${JSON.stringify(parsedMessage)} від ${ws.username}`)

        switch (parsedMessage.type) {
            case 'join_room':
                const roomName = parsedMessage.roomName
                if (roomName) {
                    const updateRoomUsersCallback = async (currentRoomName, clientsInRoom) => {
                        const userList = Array.from(clientsInRoom).map((c) => c.username)
                        appLogger.debug(
                            `Оновлення кімнати '${currentRoomName}': ${userList.length} користувачів.`,
                        )
                        return {
                            type: 'room_update',
                            message: `Користувачі в кімнаті '${currentRoomName}': ${userList.join(
                                ', ',
                            )}`,
                            userCount: userList.length,
                            users: userList,
                        }
                    }

                    const updateIntervalMs = 5000 // Оновлювати список користувачів кожні 5 секунд
                    const runInitialUpdate = true // Надіслати список одразу при приєднанні

                    const joined = roomManager.joinRoom(
                        roomName,
                        ws,
                        updateRoomUsersCallback,
                        updateIntervalMs,
                        runInitialUpdate,
                    )

                    if (joined) {
                        ws.send(
                            JSON.stringify({
                                type: 'system_message',
                                content: `Ви приєдналися до кімнати '${roomName}'.`,
                            }),
                        )
                        roomManager.sendMessageToRoom(roomName, {
                            type: 'system_message',
                            content: `${ws.username} приєднався до кімнати.`,
                            userCount: roomManager.getClientCount(roomName),
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
                        JSON.stringify({ type: 'error', message: 'Будь ласка, вкажіть roomName.' }),
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
                    roomManager.sendMessageToRoom(targetRoom, chatMessage)
                    appLogger.debug(
                        `Чат-повідомлення в кімнату '${targetRoom}' від ${ws.username}: ${content}`,
                    )
                } else {
                    ws.send(
                        JSON.stringify({
                            type: 'error',
                            message: 'Ви маєте приєднатися до кімнати, щоб надсилати повідомлення.',
                        }),
                    )
                }
                break

            case 'leave_room':
                const leaveRoomName = parsedMessage.roomName || ws.currentRoom
                if (leaveRoomName) {
                    const left = roomManager.leaveRoom(leaveRoomName, ws)
                    if (left) {
                        ws.send(
                            JSON.stringify({
                                type: 'system_message',
                                content: `Ви покинули кімнату '${leaveRoomName}'.`,
                            }),
                        )
                        if (roomManager.rooms.has(leaveRoomName)) {
                            roomManager.sendMessageToRoom(leaveRoomName, {
                                type: 'system_message',
                                content: `${ws.username} покинув кімнату.`,
                                userCount: roomManager.getClientCount(leaveRoomName),
                            })
                        }
                        delete ws.currentRoom
                    } else {
                        ws.send(
                            JSON.stringify({
                                type: 'error',
                                message: `Не вдалося покинути кімнату '${leaveRoomName}'. Можливо, ви не були в ній.`,
                            }),
                        )
                    }
                } else {
                    ws.send(
                        JSON.stringify({
                            type: 'error',
                            message:
                                'Будь ласка, вкажіть roomName для виходу або спочатку приєднайтеся до кімнати.',
                        }),
                    )
                }
                break

            default:
                ws.send(JSON.stringify({ type: 'error', message: 'Невідомий тип повідомлення.' }))
                break
        }
    })

    ws.on('close', () => {
        appLogger.info(`Клієнт відключився: ${ws.username}`)
    })

    ws.on('error', (error) => {
        appLogger.error(`Помилка WebSocket для клієнта ${ws.username}: ${error.message}`)
    })
})

// --- Глобальна розсилка (наприклад, для системних оголошень) ---
setInterval(() => {
    const globalMessage = {
        type: 'global_announcement',
        content: `Це глобальне оголошення від сервера! Час: ${new Date().toLocaleTimeString(
            'uk-UA',
        )}. Всього користувачів онлайн: ${roomManager.clientRoomMap.size}`,
    }
    const sentCount = roomManager.broadcastToAllClients(globalMessage)
    appLogger.info(`Надіслано глобальне оголошення ${sentCount} клієнтам.`)
}, 15000) // Кожні 15 секунд

// --- Запуск HTTP сервера ---
server.listen(PORT, () => {
    appLogger.info(`Сервер запущено на http://localhost:${PORT}`)
    appLogger.info(`WebSocket сервер запущено на ws://localhost:${PORT}`)
})
