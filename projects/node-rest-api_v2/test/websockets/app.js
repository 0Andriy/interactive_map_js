// app.js
import express from 'express'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

// Імпортуємо ваш WebSocketManager та новий WebSocketMessageHandler
import WebSocketManager from './src/websockets/WebSocketManager.js'
import WebSocketMessageHandler from './src/websockets/WebSocketMessageHandler.js'

// --- Конфігурація ES-модулів для __dirname ---
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// --- 1. Імплементація DbService (сервіс для роботи з базою даних) ---
// У реальному застосунку це був би модуль, що взаємодіє з вашою БД (наприклад, PostgreSQL, MongoDB тощо).
// Тут ми використаємо прості заглушки для демонстрації.
const myDbService = {
    // Метод для загальних даних кімнати (використовується за замовчуванням для динамічних кімнат)
    getRoomData: async (roomName, params = {}) => {
        console.log(`[DbService] Запит getRoomData для '${roomName}' з параметрами:`, params)
        // Імітуємо затримку запиту до БД
        await new Promise((resolve) => setTimeout(resolve, 500))
        return {
            message: `Дані для кімнати '${roomName}'`,
            timestamp: new Date().toISOString(),
            dynamicParam: params.param || 'N/A',
        }
    },
    // Метод для кімнати новин (припустимо, що є predefined кімната 'global-news')
    getNewsFeedData: async (roomName) => {
        console.log(`[DbService] Запит getNewsFeedData для '${roomName}'`)
        await new Promise((resolve) => setTimeout(resolve, 800))
        return [
            { id: 1, title: 'Breaking News: AI continues to advance!', category: 'AI' },
            { id: 2, title: 'Local Event: Tech Meetup next week', category: 'Community' },
        ]
    },
    // Метод для отримання статусу замовлення за ID (для динамічної кімнати 'order-status-XYZ')
    getOrderByOrderId: async (orderId) => {
        console.log(`[DbService] Запит getOrderByOrderId для ID: ${orderId}`)
        await new Promise((resolve) => setTimeout(resolve, 300))
        const statuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled']
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)]
        return { orderId, status: randomStatus, lastUpdate: new Date().toISOString() }
    },
    // Інші методи DbService можуть бути додані тут
}

// --- 2. Імплементація AuthService (сервіс автентифікації) ---
// У реальному застосунку це був би модуль, що перевіряє JWT токени або сесії.
const myAuthService = {
    verifyToken: async (token) => {
        console.log(`[AuthService] Перевірка токена: ${token}`)
        await new Promise((resolve) => setTimeout(resolve, 100)) // Імітуємо затримку
        if (token === 'valid_user_token_123') {
            return { isValid: true, payload: { userId: 'user_123', roles: ['admin', 'user'] } }
        }
        if (token === 'valid_user_token_456') {
            return { isValid: true, payload: { userId: 'user_456', roles: ['user'] } }
        }
        // Токен для тестування адміністративних функцій (наприклад, adminCommand)
        if (token === 'valid_admin_token_789') {
            return { isValid: true, payload: { userId: 'admin_789', roles: ['admin', 'user'] } }
        }
        return { isValid: false, payload: null }
    },
}

// --- 3. Налаштування конфігурації WebSocketManager ---
const wsConfig = {
    websocket: {
        defaultRoomUpdateInterval: 3000, // Динамічні кімнати оновлюються кожні 3 секунди
        path: '/ws', // Шлях для WebSocketServer - тепер в конфігурації
        predefinedRooms: [
            {
                name: 'global-news',
                updates: {
                    enabled: true,
                    intervalMs: 5000, // Оновлення кожні 5 секунд
                    dataSource: 'getNewsFeedData', // Використовувати метод getNewsFeedData з dbService
                },
            },
            {
                name: 'system-status',
                updates: {
                    enabled: true,
                    intervalMs: 2000, // Оновлення кожні 2 секунди
                    dataSource: 'getRoomData', // Для простоти використовуємо getRoomData
                },
            },
            // Додайте більше попередньо визначених кімнат за потреби
        ],
    },
}

// --- 4. Створення Express-додатку та HTTP-сервера ---
const app = express()
const httpServer = http.createServer(app) // Створюємо HTTP-сервер з Express-додатку

// --- 5. Налаштування Express для обслуговування статичних файлів ---
// Обслуговуємо HTML-файл з тієї ж директорії
app.use(express.static(__dirname))

// --- 6. Ініціалізація WebSocketManager ---

// <== Створюємо екземпляр обробника повідомлень
// На цьому етапі wsManager ще не створений, тому передаємо null.
// Ми встановимо посилання на wsManager пізніше.
const myMessageHandler = new WebSocketMessageHandler(null)

const wsManager = new WebSocketManager(httpServer, {
    logger: console, // Використовуємо стандартний консольний логер (WebSocketManager його розширить)
    dbService: myDbService,
    authService: myAuthService,
    messageHandler: myMessageHandler, // <== ПЕРЕДАЄМО НАШ ОБРОБНИК!
    config: wsConfig,
})

// <== Тепер, коли wsManager створений, передаємо його посилання в myMessageHandler.
// Це необхідно, щоб myMessageHandler міг викликати методи wsManager (наприклад, sendToRoom).
myMessageHandler.wsManager = wsManager

// --- 7. Запуск сервера ---
const PORT = 8080
httpServer.listen(PORT, () => {
    console.log(`Express HTTP-сервер слухає на http://localhost:${PORT}`)
    console.log(`WebSocket-сервер слухає на ws://localhost:${PORT}/ws`)
    console.log('Відкрийте http://localhost:8080 у вашому браузері.')
})
