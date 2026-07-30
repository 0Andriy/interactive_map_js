import http from 'http'
import { Server } from './src/core/Server.js'
import { SessionRecovery } from './src/extensions/SessionRecovery.js'

const io = new Server()

// 1. Інтегруємо перехоплювач сесій у ланцюжок авторизації підключень
io.use(SessionRecovery.handleMiddleware())

// Додатковий middleware (наприклад, для нових користувачів)
io.use(async (ctx, next) => {
    const { handshake } = ctx
    if (!handshake.isRecovered) {
        // Якщо сесія нова — робимо стандартну авторизацію
        handshake.user = { id: 'user_123', name: 'Олексій' }
    }
    next()
})

// 2. Реєструємо SessionRecovery як глобальний плагін життєвого циклу
io.plugin(SessionRecovery, { timeout: 60000 }) // Очікувати реконнект 1 хвилину

const chatNsp = io.of('/chats')

chatNsp.on('connection', (socket) => {
    if (socket.handshake.isRecovered) {
        console.log(`♻️  [Сесія відновлена]: Сокет ${socket.id} повернувся в чат!`)
    } else {
        console.log(`✨ [Нове підключення]: Створено сокет ${socket.id}`)
        socket.join('main-lobby')
    }

    socket.on('chat-message', (msg) => {
        chatNsp.to('main-lobby').emit('msg-broadcast', `${socket.user.name}: ${msg}`)
    })
})

const httpServer = http.createServer()
io.attach(httpServer)
httpServer.listen(3000, () =>
    console.log('🚀 Сервер з підтримкою Session Recovery запущено на порту 3000'),
)
