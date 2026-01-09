import http from 'node:http'
import { NexusServer } from './core/Server.js'
import { UnifiedTaskManager } from './utils/UnifiedTaskManager.js'
// import { RedisAdapter } from './src/RedisAdapter.js'; // Розкоментуйте для Redis

// 1. Создаем обычный HTTP сервер
const httpServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('HTTP сервер работает.')
})

const io = new NexusServer({
    server: httpServer,
    // adapter: RedisAdapter // Додайте, якщо піднятий Redis
})
const tasks = new UnifiedTaskManager()

// console.log('✅ NexusSocket server started on ws://localhost:3000')

// 1. ЗАДАЧА НА РІВНІ СЕРВЕРА (завжди активна)
tasks.addTask(io, 'server-log', 60000, () => {
    console.log(`[Stats] Total namespaces: ${io.namespaces.size}`)
})

// Тепер io.on працює для дефолтного неймспейсу
io.on('connection', (socket) => {
    console.log(`[/] User connected: ${socket.id}`)

    // 2. ЗАДАЧА НА РІВНІ СОКЕТА (тільки для цього юзера)
    // Наприклад: перевірка пінгу або оновлення особистих сповіщень
    tasks.addTask(
        socket,
        'user-ping',
        5000,
        (socket) => socket.emit('ping', { ts: Date.now() }),
        () => socket.rawWs.readyState === 1, // Умова: сокет відкритий
    )

    socket.on('join_room', (roomName) => {
        socket.join(roomName)
        const room = io.of('/')._getOrCreateRoom(roomName)

        // 3. ЗАДАЧА НА РІВНІ КІМНАТИ (поки в ній хтось є)
        tasks.addTask(
            room,
            'room-broadcast',
            2000,
            (r) => r.emit('room_data', { players: r.size }),
            () => room.size > 0, // Умова: кімната не порожня
        )
    })

    // 2. Вихід з кімнати по запиту
    socket.on('leave_game', (roomName) => {
        socket.leave(roomName)
        console.log(`User ${socket.id} left ${roomName}`)

        // Якщо в кімнаті нікого — тикер зупиниться автоматично в Room.js
    })

    socket.on('disconnect', () => {
        console.log('User disconnected')
        // Чистимо задачі сокета при виході
        tasks.stopAll(socket.id)
    })
})

// Оголошуємо існуючі простори
const chat = io.of('/chat')
const news = io.of('/news')

// Логіка для /chat
chat.on('connection', (socket) => {
    console.log(`[Chat] User connected: ${socket.id}`)

    socket.on('join_room', (roomName) => {
        socket.join(roomName)
        console.log(`[Chat] User ${socket.id} joined room: ${roomName}`)

        // Повідомляємо інших у кімнаті
        socket.to(roomName).emit('user_joined', { userId: socket.id })
    })

    socket.on('message', (data) => {
        console.log(`[Chat] Message received:`, data)
        // Розсилка всім у кімнаті
        chat.to(data.room).emit('new_message', {
            from: socket.id,
            text: data.text,
        })
    })

    socket.on('disconnect', () => {
        console.log(`[Chat] User disconnected: ${socket.id}`)
    })
})

// Логіка для /news (тільки розсилка від сервера)
news.on('connection', (socket) => {
    socket.emit('welcome', 'Welcome to the News Channel!')
})

// Приклад серверної розсилки кожні 10 секунд
setInterval(() => {
    news.emit('tick', { time: new Date().toISOString() })
}, 10000)

// 4. Запуск сервера
const PORT = 3000
httpServer.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`)
})
