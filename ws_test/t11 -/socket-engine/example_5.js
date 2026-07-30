import http from 'http'
import Redis from 'ioredis' // Імпортуємо ваш Redis драйвер
import { Server } from './src/core/Server.js'
import { createRedisAdapter } from './src/adapters/RedisAdapter.js'

// 1. Створюємо виділені Pub/Sub інстанси згідно з паттерном Socket.IO
const pubClient = new Redis({ host: '127.0.0.1', port: 6379 })
const subClient = new Redis({ host: '127.0.0.1', port: 6379 })

// 2. Ініціалізуємо сервер з передачею створених клієнтів через DI фабрику
const io = new Server(
    null,
    {
        path: '/ws',
    },
    {
        // Фабрика загортає ваші клієнти всередину конструктора адаптерів для Namespace
        AdapterClass: createRedisAdapter(pubClient, subClient),
    },
)

const chatNsp = io.of('/chats')

chatNsp.on('connection', (socket) => {
    console.log(`[Кластер] Сокет підключено: ${socket.id}`)

    // Тепер це працює: сокет знаходиться у кімнаті імені себе
    // Навіть якщо цей socket.id підключений до іншої ноди, Redis доставить івент
    socket.on('alert-user', (targetSocketId) => {
        chatNsp.to(targetSocketId).emit('private-ping', `Привіт від ${socket.id}`)
    })
})

const httpServer = http.createServer()
io.attach(httpServer)
httpServer.listen(3000, () =>
    console.log('🚀 Масштабований сервер на базі зовнішнього Redis запущено!'),
)
