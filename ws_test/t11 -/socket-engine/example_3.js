import http from 'http'
import { Server } from './src/core/Server.js'
import { Heartbeat } from './src/extensions/Heartbeat.js'
import { AckManager } from './src/extensions/AckManager.js'

// Ініціалізація з налаштуванням глобального CORS та WS-префіксу
const io = new Server(null, {
    path: '/ws', // Всі лінки повинні починатися з /ws/...
    cors: {
        origin: ['http://localhost:8080', 'https://my-app.com'], // Дозволені домени
    },
})

// Глобальні розширення
io.plugin(Heartbeat)
io.plugin(AckManager)

// Глобальне middleware аутентифікації
io.use(async (ctx, next) => {
    const { handshake } = ctx

    // Читаємо розширені дані з handshake
    const token = handshake.query.token
    const userAgent = handshake.headers['user-agent']
    const userCookie = handshake.cookies['session_id']

    if (!token) {
        return next(new Error('Authentication failed: Missing Token'))
    }

    // Емуляція визначення користувача за токеном.
    // Навіть якщо користувач увійде з 3-х різних пристроїв (user-agent), ID буде однаковим.
    handshake.user = {
        id: 'user_999',
        name: 'Іван',
        device: userAgent.includes('Mobile') ? 'Phone' : 'Desktop',
    }

    next()
})

// ==========================================
// 🛣️ РОУТИНГ ПРОСТОРІВ ІМЕН (URL РІШЕННЯ)
// ==========================================

// Варіант А: Фіксований URL (Повна адреса: /ws/chats)
const chatNsp = io.of('/chats')
chatNsp.on('connection', (socket) => {
    console.log(`[Chats] ${socket.user.name} підключився через пристрій: ${socket.user.device}`)

    // Дізнатися всі кімнати (включаючи персональну 'user:user_999')
    console.log('Кімнати цього девайсу:', Array.from(socket.rooms))
})

// Варіант Б: Динамічний URL за допомогою RegExp (Наприклад: /ws/game/123, /ws/game/abc)
const gameRegExp = /^\/game\/([a-zA-Z0-9]+)$/
const gameNsp = io.of(gameRegExp)

gameNsp.on('connection', (socket) => {
    // Дістаємо ID динамічної кімнати/гри прямо з URL
    const match = socket.handshake.pathname.match(gameRegExp)
    const gameId = match ? match[1] : 'unknown'

    console.log(`[Game] Користувач зайшов у динамічний URL гри ID: ${gameId}`)
    socket.join(`game-room:${gameId}`)
})

// ==========================================
// 📱 MULTI-DEVICE BROADCAST (ЯК ПРАЦЮЄ)
// ==========================================
setInterval(() => {
    // Надсилаємо повідомлення конкретному користувачу.
    // Якщо Іван підключений одночасно з телефону та ПК, повідомлення прилетить на обидва пристрої!
    io.toUser('user_999').emit('notification', {
        text: 'Привіт! Це повідомлення відправлено на всі твої пристрої одночасно.',
    })
}, 10000)

const httpServer = http.createServer()
io.attach(httpServer)
httpServer.listen(3000, () => console.log('🚀 Промисловий WS сервер запущено на порту 3000'))
