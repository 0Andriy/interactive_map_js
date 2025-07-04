// src/websockets/index.js
import { WebSocketServer } from 'ws'
import { handleChatConnection } from './services/chatService.js'
import { handleNotificationConnection } from './services/notificationService.js'
import { initializeRedisPubSub } from './pubsub.js'

// Зберігаємо інстанси WebSocketServer для кожного сервісу
let chatWss
let notificationWss

/**
 * Ініціалізує всі WebSocket-сервіси та прив'язує їх до події 'upgrade' HTTP-сервера.
 * @param {import('http').Server} httpServer - Існуючий HTTP-сервер.
 */
const initializeWebSocketServices = (httpServer) => {
    // Створюємо окремі WebSocketServer інстанси для кожного сервісу
    // Використовуємо { noServer: true }, щоб самостійно керувати upgrade запитами
    chatWss = new WebSocketServer({ noServer: true })
    notificationWss = new WebSocketServer({ noServer: true })

    // Ініціалізуємо Redis Pub/Sub, передаючи всі WSS інстанси, якщо потрібно
    // Або, що краще, Pub/Sub повинен знати про клієнтів незалежно,
    // або повідомлення будуть оброблятися всередині кожного сервісу.
    initializeRedisPubSub({ chatWss, notificationWss }) // Можливо, передаємо об'єкт з WSS-сервісами

    // Обробляємо кожне нове WebSocket-з'єднання для чату
    chatWss.on('connection', (ws, request) => {
        console.log(`Chat client connected from path: ${request.url}`)
        handleChatConnection(ws, request) // Делегуємо логіку обробки до chatService
    })

    // Обробляємо кожне нове WebSocket-з'єднання для сповіщень
    notificationWss.on('connection', (ws, request) => {
        console.log(`Notification client connected from path: ${request.url}`)
        handleNotificationConnection(ws, request) // Делегуємо логіку обробки до notificationService
    })

    // Головний обробник події 'upgrade' від HTTP-сервера
    httpServer.on('upgrade', (request, socket, head) => {
        const parsedUrl = new URL(request.url, `http://${request.headers.host}`)
        const pathname = parsedUrl.pathname

        console.log(`WebSocket upgrade request for: ${pathname}`)

        if (pathname === '/ws/chat') {
            // Передаємо upgrade запит до chatWss
            chatWss.handleUpgrade(request, socket, head, (ws) => {
                chatWss.emit('connection', ws, request) // Викликаємо подію 'connection' для wssChat
            })
        } else if (pathname === '/ws/notifications') {
            // Передаємо upgrade запит до notificationWss
            notificationWss.handleUpgrade(request, socket, head, (ws) => {
                notificationWss.emit('connection', ws, request) // Викликаємо подію 'connection' для wssNotifications
            })
        } else {
            // Якщо шлях не відповідає жодному WebSocket-сервісу
            console.log(`Unknown WebSocket path: ${pathname}. Destroying socket.`)
            socket.destroy() // Закриваємо з'єднання
        }
    })

    console.log('WebSocket services initialized and ready for upgrade requests.')
}

export default initializeWebSocketServices

// Експортуємо інстанси, якщо потрібно звертатися до них з інших модулів (наприклад, для розсилки повідомлень)
export const getChatWss = () => chatWss
export const getNotificationWss = () => notificationWss
