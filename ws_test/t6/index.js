import http from 'http'
import express from 'express'
import { IoServer } from './socket-engine/core/IoServer.js'
import { InMemoryAdapter } from './socket-engine/adapters/InMemoryAdapter.js'
import { RedisAdapter } from './socket-engine/adapters/RedisAdapter.js'

// --- КОНФІГУРАЦІЯ ОТОЧЕННЯ (Можна винести в .env) ---
const PORT = process.env.PORT || 3000
const REDIS_ENABLED = process.env.REDIS_ENABLED === 'true' // true/false
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'

// --- ІМІТАЦІЯ СИСТЕМНОГО ЛОГЕРА (pino / winston / console) ---
const createLogger = (baseCtx = {}) => {
    // Форматуємо контекст у рядок, якщо він є
    const getCtxStr = (ctx) => {
        const entries = Object.entries(ctx)
        return entries.length ? `[${entries.map(([k, v]) => `${k}=${v}`).join(' ')}] ` : ''
    }

    const ctxStr = getCtxStr(baseCtx)

    return {
        info: (msg, ...args) => console.log(`\x1b[32m[INFO]\x1b[0m ${ctxStr}${msg}`, ...args),
        warn: (msg, ...args) => console.warn(`\x1b[33m[WARN]\x1b[0m ${ctxStr}${msg}`, ...args),
        error: (msg, ...args) => console.error(`\x1b[31m[ERROR]\x1b[0m ${ctxStr}${msg}`, ...args),
        debug: (msg, ...args) => console.debug(`\x1b[34m[DEBUG]\x1b[0m ${ctxStr}${msg}`, ...args),

        // Створює новий логер, об'єднуючи поточний контекст із новим
        child: (newCtx) => createLogger({ ...baseCtx, ...newCtx }),
    }
}

// Ініціалізація головного логера
const logger = createLogger()

// --- 1. СТВОРЕННЯ ФАБРИКИ АДАПТЕРІВ (ЛОКАЛЬНО / КЛАСТЕР) ---
let adapterFactory

if (REDIS_ENABLED) {
    logger.info(`Ініціалізація кластерного режиму через Redis...`)

    // Динамічний імпорт на випадок, якщо бібліотека redis не встановлена локально
    const { createClient } = await import('redis')

    const pubClient = createClient({ url: REDIS_URL })
    const subClient = pubClient.duplicate()

    await Promise.all([pubClient.connect(), subClient.connect()])
    logger.info(`Успішне підключення до Redis: ${REDIS_URL}`)

    // Передаємо логер в адаптер, як закладали в архітектурі
    adapterFactory = (nspName) => new RedisAdapter(nspName, pubClient, subClient, { logger })
} else {
    logger.info(`Ініціалізація локального режиму (In-Memory).`)
    adapterFactory = (nspName) => new InMemoryAdapter(nspName)
}

// // --- 2. СТВОРЕННЯ БАЗОВОГО HTTP СЕРВЕРА ---
// const httpServer = http.createServer((req, res) => {
//     res.writeHead(200, { 'Content-Type': 'text/plain' })
//     res.end('WebSocket Gateway is running.')
// })

// --- 2. ІНІЦІАЛІЗАЦІЯ БАЗОВОГО HTTP СЕРВЕРА ТА EXPRESS ---
const app = express()
const httpServer = http.createServer(app)

app.use(express.json())

// --- 3. СТВОРЕННЯ ТА НАЛАШТУВАННЯ IO СЕРВЕРА ---
const io = new IoServer(adapterFactory, logger, {
    path: '/ws',
    gracePeriodMs: 5000, // 5 секунд грації для перепідключення (захист від втрати кімнат)
    pingIntervalMs: 20000, // Highload таймаут бездіяльності в 20 секунд
    // // НАЛАШТУВАННЯ CORS БЕЗПЕКИ:
    // cors: {
    //     origin: [
    //         'https://my-production-app.com', // Ваш продакшн сайт
    //         'https://my-production-app.com', // Ваша адмінка
    //         'http://localhost:3000', // Локальний фронтенд для розробки
    //         'http://127.0.0.1:3000',
    //     ],
    // },
})

// ПРИКРІПЛЮЄМО WS-ШАР ДО HTTP
io.attach(httpServer)

// Робимо io доступним глобально для будь-якого Express роута
app.set('io', io)

// --- 4. РОБОЧИЙ ЕНДПОІНТ МОНІТОРИНГУ СТАТИСТИКИ ---
app.get('/api/v1/admin/stats', async (req, res) => {
    try {
        // Надійно дістаємо io з додатка Express через Dependency Injection
        const ioInstance = req.app.get('io')

        // Викликаємо метод збору статистики
        const serverStats = await ioInstance.getStats()

        // Повертаємо структурований JSON
        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(), // Час роботи Node.js процесу в секундах
            memoryUsage: process.memoryUsage(), // Використання оперативної пам'яті
            data: serverStats,
        })
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message })
    }
})

// --- 5. НАЛАШТУВАННЯ ПРОСТОРУ НАЗВ (NAMESPACE) ТА MIDDLEWARE ---
const chatNamespace = io.of('/chat')

// Мідлвар для безпечної авторизації за токеном
chatNamespace.use((socket, next) => {
    // Ми можемо взяти токен з розширеного handshake, який ми розписали
    const token = socket.handshake.query.token || socket.handshake.authHeader

    if (!token) {
        return next(new Error('Authentication failed: Token is missing'))
    }

    // Ваша логіка перевірки токена (наприклад, jwt.verify)
    if (token === 'valid_secret_token_123') {
        // Додаємо корисні бізнес-дані прямо в об'єкт сокета
        socket.user = { id: 'usr_99', name: 'Олексій', role: 'admin' }
        return next() // Успішно! Клієнт отримає сигнал 'connect' (OPEN)
    }

    if (token === 'valid_secret_token_124') {
        // Додаємо корисні бізнес-дані прямо в об'єкт сокета
        socket.user = { id: 'usr_100', name: 'Діма', role: 'admin' }
        return next() // Успішно! Клієнт отримає сигнал 'connect' (OPEN)
    }

    // Якщо токен невалідний
    return next(new Error('Authentication failed: Invalid token'))
})

// --- 5. ОБРОБКА БІЗНЕС-ПОДІЙ ПІСЛЯ АВТОРИЗАЦІЇ ---
chatNamespace.on('connection', async (socket) => {
    // ЗАХИСТ: Навіть якщо розробник забуде додати мідлвар, перевіряємо наявність об'єкта user
    if (!socket.user || !socket.user.id) {
        logger.warn(
            `[Security Alert] Спроба неавторизованого підключення до сесії ${socket.id}. Термінація.`,
        )
        return socket.terminate()
    }

    logger?.info?.(
        `[App] Сокет ${socket.id} (Користувач: ${socket.user.name}) повністю готовий до роботи.`,
    )

    // ----------------------

    if (socket.user || socket.user.id) {
        // МАГІЯ МУЛЬТИ-ДЕВАЙСУ (В одного користувача багато різних сокет підключень):
        // Додаємо сокет у кімнату, яка називається як ID самого користувача в БД
        // Додаємо сокет у кімнату користувача за вашим шаблоном
        const userRoomName = `user:${socket.user.id}`
        socket.join(userRoomName)
    }

    socket.on('send_private_message', (payload) => {
        const { targetUserId, text } = payload // targetUserId = "user_99"

        // Надсилаємо повідомлення в кімнату користувача.
        // Його отримають ВСІ 5 вкладок та пристроїв Олексія одночасно!
        chatNamespace.to(`user:${targetUserId}`).emit('private_message', {
            from: socket.user.name,
            text: text,
        })
    })

    // ------------------------------------------

    // // Через 5 секунд вмикаємо примусову імітацію "смерті" клієнта
    // setTimeout(() => {
    //     logger.warn(`[TEST] Вмикаємо імітацію обриву зв'язку для сокета ${socket.id}...`)
    //     socket.isSimulatingDeath = true
    // }, 5000)

    // Обробка входу в кімнату
    socket.on('join_room', (roomName) => {
        socket.join(roomName)
        logger?.info?.(`[App] Сокет ${socket.id} зайшов у кімнату: ${roomName}`)

        // Повідомляємо інших учасників кімнати (бродкаст від імені сокета)
        socket.to(roomName).emit('user_joined', { userId: socket.user.id, name: socket.user.name })
    })

    // Обробка виходу з кімнати
    socket.on('leave_room', (roomName) => {
        socket.leave(roomName)
        logger?.info?.(`[App] Сокет ${socket.id} вийшов з кімнати: ${roomName}`)

        // Повідомляємо інших учасників кімнати (бродкаст від імені сокета)
        socket.to(roomName).emit('user_left', { userId: socket.user.id, name: socket.user.name })
    })

    // Обробка повідомлення у кімнату
    socket.on('send_message', (payload) => {
        const { roomName, text } = payload

        const messagePacket = {
            id: `msg_${Math.random().toString(36).substring(2, 7)}`,
            sender: socket.user.name,
            text,
            time: new Date().toLocaleTimeString(),
        }

        // Розсилаємо повідомлення усім у кімнаті, включаючи відправника (через неймспейс)
        chatNamespace.to(roomName).emit('new_message', messagePacket)
    })

    // Подія перед остаточним відключенням (коли кімнати ще доступні)
    socket.on('disconnecting', (rooms) => {
        logger?.info?.(
            `[App] Сокет ${socket.id} відключається. Перебував у кімнатах:`,
            Array.from(rooms),
        )
    })

    // Остаточне відключення після періоду грації (gracePeriodMs)
    socket.on('disconnect', (reason) => {
        logger?.info?.(`[App] Сокет ${socket.id} остаточно видалено з пам'яті. Причина:`, reason)
    })

    // * ACK
    // Сценарій 1: Сервер слухає клієнта і повертає йому ACK через функцію "callback"
    socket.on('get_server_time', (data, callback) => {
        logger?.info?.('Клієнт попросив час з даними:', data)

        if (typeof callback === 'function') {
            // Викликаємо коллбек — це автоматично надішле клієнту відповідь
            callback({ timestamp: Date.now(), status: 'success' })
        }
    })

    // Сценарій 2: Сервер сам просить у клієнта ACK через .timeout() з async/await
    try {
        logger?.info?.('Сервер робить запит клієнту з очікуванням відповіді...')

        // Чекаємо 5 секунд від клієнта відповіді на подію 'ping_client'
        const clientResponse = await socket.timeout(5000).emit('ping_client', { secret: 'abc' })
        logger?.info?.('Успіх! Клієнт підтвердив запит і повернув:', clientResponse)
    } catch (err) {
        logger?.error?.('Помилка: Клієнт не відповів серверу за 5 секунд!', err.message)
    }
})

// --- 6. ЗАПУСК СЕРВЕРА НА ПОРТУ ---
httpServer.listen(PORT, () => {
    logger?.info?.(`Сервер успішно запущено на порту http://localhost:${PORT}`)
    logger?.info?.(`WebSocket шлях: ws://localhost:${PORT}${io.options.path}/chat`)
})

// --- 7. ГРАЦІОЗНЕ ВИМКНЕННЯ СЕРВЕРА (GRACEFUL SHUTDOWN) ---
const handleShutdown = (signal) => {
    logger?.warn?.(`Отримано сигнал ${signal}. Починаємо граціозне вимкнення...`)

    io.close() // Зупиняє адаптери, чистить пам'ять та відключає клієнтів з кодом 1012

    httpServer.close(() => {
        logger?.info?.('HTTP-сервер повністю зупинено. Процес завершено.')
        process.exit(0)
    })
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'))
process.on('SIGINT', () => handleShutdown('SIGINT'))
