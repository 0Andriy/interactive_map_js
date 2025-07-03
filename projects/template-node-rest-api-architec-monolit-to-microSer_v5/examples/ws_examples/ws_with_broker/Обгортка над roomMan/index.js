// src/websockets/index.js (приклад використання з Варіантом 2)
import http from 'http'
import { WebSocketServer } from 'ws'
import RoomManager from './RoomManager.js' // Імпортуємо ваш оригінальний RoomManager
import {
    initializeRedisPubSub,
    publishMessage,
    subscribeToRoomChannel,
    unsubscribeFromRoomChannel,
    closeRedisConnections,
} from './pubsub.js' // Імпортуємо Pub/Sub функціональність

const appLogger = console

// Ініціалізація локального RoomManager
const roomManager = new RoomManager(appLogger)

// Ініціалізація Redis Pub/Sub, передаючи roomManager
initializeRedisPubSub(roomManager, appLogger)

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

        wssInstance.handleUpgrade(request, socket, head, async (ws) => {
            /** @type {import('./RoomManager.js').CustomWebSocket} */ ;(ws).id = userId
            /** @type {import('./RoomManager.js').CustomWebSocket} */ ;(ws).username = username
            /** @type {import('./RoomManager.js').CustomWebSocket} */ ;(ws).userId = userId

            wssInstance.emit('connection', ws, request)

            // Функція для створення/приєднання до кімнати
            const handleRoomJoin = async (
                roomName,
                wsClient,
                updateCallback = async () => null,
                updateIntervalMs = 0,
                runInitialUpdate = false,
            ) => {
                const joined = roomManager.joinRoom(
                    roomName,
                    wsClient,
                    updateCallback,
                    updateIntervalMs,
                    runInitialUpdate,
                )
                if (joined) {
                    // Якщо успішно приєднався (і це перший клієнт на інстансі для цієї кімнати)
                    // підписуємося на Redis-канал для цієї кімнати
                    if (roomManager.getClientCount(roomName) === 1) {
                        // Перевірка, чи це перший клієнт на цьому інстансі
                        await subscribeToRoomChannel(roomName)
                    }
                }
            }

            // Перевизначаємо ws.on('close') для коректної відписки від Redis каналів
            // Ваш RoomManager вже має логіку для __closeHandlerRegistered, тому це має працювати
            const originalOnClose = ws.on.bind(ws)
            ws.on = (event, listener) => {
                if (event === 'close') {
                    originalOnClose(event, async () => {
                        // Очищаємо від локальних кімнат через RoomManager (який в свою чергу викличе leaveRoom)
                        // А RoomManager в leaveRoom перевірить, чи кімната порожня і викличе unsubscribeFromRoomChannel
                        // (або ми можемо викликати тут напряму, якщо хочемо більше контролю).
                        // Простіше дозволити RoomManager'у викликати #removeClientGlobally, який викличе leaveRoom для кожної кімнати.
                        // leaveRoom вже містить логіку відписки від Redis каналу, якщо кімната порожня.
                        // Просто переконайтеся, що #removeClientGlobally викликається!
                        // P.S. В оригінальному RoomManager #removeClientGlobally вже викликається
                        // коли clientWebSocket.on('close') спрацьовує, тому ця обгортка не завжди потрібна.
                        // Але це демонструє, як можна інтегрувати Pub/Sub відписки тут.

                        // Цей блок лише для демонстрації, як PubSub може контролювати відписки,
                        // але поточна реалізація RoomManager вже обробляє це через #removeClientGlobally
                        // і виклики leaveRoom. Тому, можливо, вам не потрібно явно викликати unsubscribe тут.
                        // Якщо ws.myRooms не null, то клієнт приєднаний до кімнат
                        if (ws.myRooms) {
                            for (const roomName of ws.myRooms) {
                                // Якщо це останній клієнт на цьому інстансі для цієї кімнати, відписуємось від Redis
                                if (roomManager.getClientCount(roomName) === 1) {
                                    // Перед тим як він буде видалений
                                    await unsubscribeFromRoomChannel(roomName)
                                }
                            }
                        }
                        listener() // Викликаємо оригінальний слухач
                    })
                } else {
                    originalOnClose(event, listener)
                }
            }

            if (pathname === '/ws/chat') {
                await handleRoomJoin('main_chat', ws)
                ws.send(
                    JSON.stringify({
                        type: 'WELCOME',
                        message: `Привіт, ${username}! Ти в головному чаті.`,
                    }),
                )
            } else if (pathname.startsWith('/ws/game/')) {
                const gameId = pathname.split('/').pop()
                await handleRoomJoin(
                    `game:${gameId}`,
                    ws,
                    async (roomName, clients) => {
                        // Цей callback викликається локально RoomManager'ом.
                        // Ми просто повертаємо дані, які потім RoomManager локально розішле.
                        // Але якщо дані повинні бути синхронізовані по всьому кластеру,
                        // цей callback має публікувати їх у Redis, а не повертати.
                        // Або ж інший механізм має керувати синхронізацією даних гри.
                        // Для цього варіанту, якщо updateCallback генерує дані, які мають бути глобальними,
                        // то саме тут потрібно викликати publishMessage.
                        const updateData = {
                            type: 'GAME_UPDATE',
                            status: 'In progress',
                            players: clients.size,
                        }
                        await publishMessage(`room:${roomName}`, updateData) // Публікуємо в Redis
                        return updateData // Можна повертати, якщо RoomManager його використовує локально
                    },
                    1000,
                    true,
                )
                ws.send(JSON.stringify({ type: 'WELCOME_GAME', message: `Ти в грі ${gameId}!` }))
            } else {
                appLogger.warn(
                    `Unknown WebSocket path: ${pathname}. Closing connection for ${userId}.`,
                )
                socket.destroy()
            }
        })
    })

    // Додайте обробник для graceful shutdown, щоб закрити Redis з'єднання
    process.on('SIGTERM', async () => {
        appLogger.info('SIGTERM received. Closing Redis connections...')
        await closeRedisConnections()
        process.exit(0)
    })
    process.on('SIGINT', async () => {
        appLogger.info('SIGINT received. Closing Redis connections...')
        await closeRedisConnections()
        process.exit(0)
    })

    appLogger.info(
        'WebSocket services initialized with RoomManager and external Redis Pub/Sub (Variant 2).',
    )
}

export { initializeWebSocketServices, roomManager } // Експортуємо roomManager
