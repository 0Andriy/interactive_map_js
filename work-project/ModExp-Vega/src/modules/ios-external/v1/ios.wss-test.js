// externalApi.wss.js

/**
 * Модуль для роботи з зовнішньою API через WebSockets
 * Реалізує схему "Один запит до API -> Розсилка багатьом клієнтам"
 */
export default function setupExternalApiSocket(io, apiClient, logger = null) {
    // roomConfigs зберігає: roomName => [id1, id2, id3...]
    const roomConfigs = new Map()
    // globalCache зберігає останні отримані дані від сторонньої API
    let globalCache = {}

    /**
     * Основний цикл опитування API
     * Використовує рекурсивний setTimeout для стабільного інтервалу в 1 сек
     */
    const startPolling = async () => {
        try {
            // Опитуємо API тільки якщо є активні підписки в кімнатах
            if (roomConfigs.size > 0) {
                // 1. Збираємо всі унікальні ID зі всіх кімнат
                const allIds = [...new Set([...roomConfigs.values()].flat())]

                // 2. Формуємо URL з параметрами
                const params = new URLSearchParams({ ids: allIds.join(',') })
                const url = `https://external.com{params}`

                // 3. Налаштовуємо таймаут (перериваємо запит, якщо API гальмує > 900мс)
                const controller = new AbortController()
                const timeoutId = setTimeout(() => controller.abort(), 900)

                const response = await fetch(url, {
                    method: 'GET',
                    signal: controller.signal,
                    headers: {
                        Accept: 'application/json',
                        // 'Authorization': 'Bearer YOUR_TOKEN' // розкоментуйте, якщо треба
                    },
                })

                clearTimeout(timeoutId)

                if (!response.ok) {
                    throw new Error(`External API status: ${response.status}`)
                }

                // 4. Оновлюємо кеш
                const data = await response.json()
                globalCache = data

                // 5. Розсилаємо дані по кімнатах (кожна отримує лише свій набір)
                for (const [roomName, ids] of roomConfigs.entries()) {
                    const roomData = ids.map((id) => globalCache[id]).filter(Boolean)

                    if (roomData.length > 0) {
                        io.to(roomName).emit('data-update', roomData)
                    }
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                logger?.warn?.('[WSS] Fetch timeout: API responded too slowly')
            } else {
                logger?.error?.('[WSS] Polling error:', err.message)
            }
        } finally {
            // Чекаємо 1 секунду після завершення попереднього запиту
            setTimeout(startPolling, 1000)
        }
    }

    // Запускаємо нескінченний цикл
    startPolling()

    /**
     * Обробка підключень клієнтів
     */
    io.on('connection', (socket) => {
        console.log(`[WSS] Client connected: ${socket.id}`)

        // Клієнт підписується на кімнату з певним набором параметрів
        socket.on('join-api-room', ({ blockId, fragmentName, ids }) => {
            // Генеруємо унікальну назву кімнати
            const roomName = `ios:${blockId}:${fragmentName}`

            if (!roomName || !Array.isArray(ids)) return

            socket.join(roomName)
            roomConfigs.set(roomName, ids)

            console.log(`[WSS] Socket ${socket.id} joined room: ${roomName}`)

            // МИТТЄВА ВІДПОВІДЬ: віддаємо дані з кешу відразу, не чекаючи секунди
            const immediateData = ids.map((id) => globalCache[id]).filter(Boolean)
            if (immediateData.length > 0) {
                socket.emit('data-update', immediateData)
            }
        })

        // Очищення при відключенні
        socket.on('disconnecting', () => {
            // socket.rooms містить id сокета + назви кімнат, у яких він перебуває
            for (const roomName of socket.rooms) {
                const room = io.sockets.adapter.rooms.get(roomName)

                // Якщо це була остання людина в кімнаті — видаляємо конфіг опитування
                if (room && room.size === 1 && roomConfigs.has(roomName)) {
                    roomConfigs.delete(roomName)
                    console.log(`[WSS] Room ${roomName} is empty, stopping polling for it`)
                }
            }
        })

        socket.on('disconnect', () => {
            console.log(`[WSS] Client disconnected: ${socket.id}`)
        })
    })
}

// import express from 'express'
// import { createServer } from 'http'
// import { Server } from 'socket.io'
// import setupExternalApiSocket from './externalApi.wss.js'

// const app = express()
// const httpServer = createServer(app)
// const io = new Server(httpServer, {
//     cors: { origin: '*' },
// })

// // Ініціалізація вашого сервісу
// setupExternalApiSocket(io)

// httpServer.listen(3000, () => console.log('Server started on port 3000'))
