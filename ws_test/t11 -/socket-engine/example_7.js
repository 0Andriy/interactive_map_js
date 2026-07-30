import http from 'http'
import Redis from 'ioredis'
import { Server } from './src/core/Server.js'
import { createRedisAdapter } from './src/adapters/RedisAdapter.js'
import { Heartbeat } from './src/extensions/Heartbeat.js'
import { AckManager } from './src/extensions/AckManager.js'
import { SessionRecovery } from './src/extensions/SessionRecovery.js'

// 1. Ініціалізація клієнтів Redis
const pubClient = new Redis({ host: '127.0.0.1', port: 6379 })
const subClient = new Redis({ host: '127.0.0.1', port: 6379 })

// 2. Ініціалізація нашого сервера з DI адаптером
const io = new Server(
    null,
    {
        path: '/ws',
        cors: { origin: '*' },
    },
    {
        AdapterClass: createRedisAdapter(pubClient, subClient),
    },
)

// 3. Реєстрація плагінів
io.use(SessionRecovery.handleMiddleware())
io.use(async (ctx, next) => {
    const { handshake } = ctx
    if (!handshake.isRecovered) {
        handshake.user = { id: 'user_999', name: 'Дмитро' }
    }
    next()
})

io.plugin(Heartbeat)
io.plugin(AckManager)
io.plugin(SessionRecovery, { timeout: 45000 }) // Очікування реконнекту 45 сек.

// --- Роутинг Напрямків ---
const chatNsp = io.of('/chats')

chatNsp.on('connection', (socket) => {
    console.log(
        `[Кластер] Коннект. Публічний ID: ${socket.id}, Секретна сесія: ${socket.sessionId}`,
    )

    if (!socket.handshake.isRecovered) {
        socket.join('kyiv-lobby')
    }

    // Тепер це працює безпечно між серверами:
    socket.on('send-private', ({ toSocketId, text }) => {
        chatNsp.to(toSocketId).emit('private-msg', { from: socket.id, text })
    })
})

// Динамічний роутинг за регулярними виразами
io.of(/^\/game\/([a-zA-Z0-9]+)$/).on('connection', (socket) => {
    console.log(`Користувач зайшов у динамічний гейм-рум: ${socket.handshake.pathname}`)
})

// 4. Ледаче кріплення до HTTP сервера
const httpServer = http.createServer()
io.attach(httpServer)

httpServer.listen(3000, () => {
    console.log('🚀 Промисловий WS-сервер запущено на базі подій "upgrade" та Redis RPC!')
})
