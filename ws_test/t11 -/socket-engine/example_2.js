import http from 'http'
import { Server } from './src/core/Server.js'
import { Heartbeat } from './src/extensions/Heartbeat.js'
import { AckManager } from './src/extensions/AckManager.js'

const io = new Server()

// 1. ГЛОБАЛЬНА РЕЄСТРАЦІЯ ПЛАГІНІВ (Extensions)
// Тепер вони автоматично застосуються до БУДЬ-ЯКОГО сокета у БУДЬ-ЯКОМУ просторі імен!
io.plugin(Heartbeat, { interval: 15000, timeout: 3000 })
io.plugin(AckManager, { timeout: 5000 })

// 2. MIDDLEWARE ПІД КЛЮЧЕННЯ (Аналог io.use для перевірки URL, токенів та авторизації)
io.use(async (ctx, next) => {
    const { handshake, req } = ctx

    console.log(`[Middleware] Новий запит на URL: ${handshake.url}`)

    // Перевірка Query параметрів (наприклад токена) або кастомних URL
    const token = handshake.query.token

    if (!token || token !== 'secret-password') {
        return next(new Error('Невірний або відсутній токен авторизації'))
    }

    // Емуляція запиту до БД: збагачуємо handshake даними користувача
    handshake.user = { id: 42, role: 'admin', name: 'Олексій' }

    next() // Пропускаємо далі
})

const chatNsp = io.of('/chat')

chatNsp.on('connection', (socket) => {
    // 3. Доступ до розширених даних про сокет
    console.log(`--- Нове підключення ---`)
    console.log(`ID: ${socket.id}`)
    console.log(`Користувач:`, socket.user) // Дані, які ми записали в middleware
    console.log(`Адреса: ${socket.handshake.address}`)
    console.log(`Час підключення: ${socket.connectedAt}`)

    socket.join('room-A')
    socket.join('room-B')

    // 4. Оптимальна перевірка кімнат (O(1) за рахунок індексу в адаптері)
    console.log(`Сокет зараз знаходиться в кімнатах:`, Array.from(socket.rooms))

    socket.on('some-client-event', () => {
        // Перевірка останньої активності
        console.log(`Остання активність сокета: ${socket.lastActivity}`)
    })
})

const httpServer = http.createServer()
io.attach(httpServer)
httpServer.listen(3000, () => console.log('Сервер готовий на порту 3000'))
