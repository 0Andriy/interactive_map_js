// src/websockets/index.js (приклад використання з Варіантом 1)
import http from 'http'
import { WebSocketServer } from 'ws'
import RoomManager from './RoomManager.js' // Імпортуємо оновлений RoomManager

// Створення логера (можна використовувати кастомний)
const appLogger = console

// Ініціалізація RoomManager з конфігурацією Redis
const roomManager = new RoomManager({
    logger: appLogger,
    redisConfig: { host: '127.0.0.1', port: 6379 }, // Ваша конфігурація Redis
})

/**
 * @param {http.Server} httpServer - Існуючий HTTP-сервер.
 * @param {WebSocketServer} wssInstance - WebSocketServer, що використовується для upgrade.
 */
const initializeWebSocketServices = (httpServer, wssInstance) => {
    httpServer.on('upgrade', async (request, socket, head) => {
        const parsedUrl = new URL(request.url, `http://${request.headers.host}`)
        const pathname = parsedUrl.pathname
        const userId = 'user-' + Math.random().toString(36).substring(2, 8) // Тимчасовий ID, замінити на реальну автентифікацію
        const username = 'Guest-' + Math.random().toString(36).substring(2, 6)

        appLogger.info(`WebSocket upgrade request for: ${pathname} from ${userId}`)

        // ВАЖЛИВО: wssInstance (з `new WebSocketServer({ noServer: true })`) обробляє `upgrade`
        wssInstance.handleUpgrade(request, socket, head, (ws) => {
            // Розширюємо об'єкт ws додатковими властивостями
            /** @type {import('./RoomManager.js').CustomWebSocket} */ ws.id = userId
            /** @type {import('./RoomManager.js').CustomWebSocket} */
            ws.username = username
            /** @type {import('./RoomManager.js').CustomWebSocket} */
            ws.userId = userId // Для ідентифікації через Redis

            wssInstance.emit('connection', ws, request) // Emit connection event for wss (якщо wss обробляє з'єднання)

            // Приєднуємо клієнта до дефолтної кімнати або логіки
            // Наприклад, у вашому головному обробнику connection
            if (pathname === '/ws/chat') {
                roomManager.joinRoom('main_chat', ws) // Приєднуємо до кімнати 'main_chat'
                ws.send(
                    JSON.stringify({
                        type: 'WELCOME',
                        message: `Привіт, ${username}! Ти в головному чаті.`,
                    }),
                )
            } else if (pathname.startsWith('/ws/game/')) {
                const gameId = pathname.split('/').pop()
                roomManager.joinRoom(
                    `game:${gameId}`,
                    ws,
                    async (roomName, clients) => {
                        // Приклад: функція оновлення для ігрової кімнати
                        // Може отримувати стан гри з БД/Redis і розсилати його
                        // Цей callback викликається локально, але publishToRedis розішле між інстансами
                        return { type: 'GAME_UPDATE', status: 'In progress', players: clients.size }
                    },
                    1000,
                    true,
                ) // Оновлення кожну секунду
                ws.send(JSON.stringify({ type: 'WELCOME_GAME', message: `Ти в грі ${gameId}!` }))
            } else {
                appLogger.warn(
                    `Unknown WebSocket path: ${pathname}. Closing connection for ${userId}.`,
                )
                socket.destroy()
            }
        })
    })

    appLogger.info('WebSocket services initialized with RoomManager (Variant 1).')
}

export { initializeWebSocketServices, roomManager } // Експортуємо roomManager, якщо потрібно його використовувати з інших модулів
