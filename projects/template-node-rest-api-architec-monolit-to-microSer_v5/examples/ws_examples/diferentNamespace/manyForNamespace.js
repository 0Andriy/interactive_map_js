// app.js

import express from 'express'
import http from 'http'
import { WebSocketServer } from 'ws' // Змінено імпорт
import RoomManager from './src/websockets/RoomManager.js' // Змінено імпорт та додано .js
import {
    initConnection as initChatConnection,
    sendMessageFromRest as sendChatMsgFromRest,
} from './src/websockets/chat.websocketService.js' // Імпорт окремих функцій
import {
    initConnection as initNotificationsConnection,
    sendNotificationToUser as sendNotifToUserFromRest,
} from './src/websockets/notifications.websocketService.js' // Імпорт окремих функцій
import authRoutes from './src/api/auth/auth.routes.js' // Змінено імпорт
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv' // Для завантаження .env файлу
dotenv.config()

const app = express()
const server = http.createServer(app)

const { JWT_SECRET } = process.env

// --- Створення різних WebSocket серверів для різних неймспейсів ---
const wssChat = new WebSocketServer({ noServer: true, path: '/ws/chat' })
const wssNotifications = new WebSocketServer({ noServer: true, path: '/ws/notifications' })

// --- Створення окремих RoomManager для кожного неймспейсу ---
const chatRoomManager = new RoomManager()
const notificationRoomManager = new RoomManager()

// Зберігаємо менеджери та WSS інстанси в об'єкті для легкого доступу
const namespaceManagers = {
    chat: { wss: wssChat, roomManager: chatRoomManager },
    notifications: { wss: wssNotifications, roomManager: notificationRoomManager },
}

// --- Передача через app.locals ---
app.locals.namespaceManagers = namespaceManagers

// --- Обробка upgrade запитів для роутингу до правильного WSS ---
server.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`)
    const path = url.pathname
    const token = url.searchParams.get('token')

    let decodedToken = null
    if (token) {
        try {
            decodedToken = jwt.verify(token, JWT_SECRET)
        } catch (err) {
            console.warn(`Invalid token for path ${path}:`, err.message)
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
            socket.destroy()
            return
        }
    } else {
        // Якщо токен обов'язковий:
        // socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        // socket.destroy();
        // return;
    }

    if (path === '/ws/chat') {
        wssChat.handleUpgrade(request, socket, head, (ws) => {
            initChatConnection(ws, chatRoomManager, decodedToken) // Використовуємо імпортовану функцію
        })
    } else if (path === '/ws/notifications') {
        wssNotifications.handleUpgrade(request, socket, head, (ws) => {
            initNotificationsConnection(ws, notificationRoomManager, decodedToken) // Використовуємо імпортовану функцію
        })
    } else {
        socket.destroy()
    }
})

// Middleware
app.use(express.json())

// API маршрути
app.use('/api/auth', authRoutes)

// Статичні файли (для вашого index.html)
app.use(express.static('public'))

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
