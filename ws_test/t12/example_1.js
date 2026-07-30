import { Server } from './Server.js'
import { RedisAdapter } from './RedisAdapter.js' // або залишаємо за замовчуванням InMemory

// 1. Ініціалізуємо наш сервер на порту 8080
const io = new Server({ port: 8080 })

// 2. Додаємо Middleware для перевірки токенів безпеки
io.use((socket, next) => {
    const token = socket.handshake.token
    if (token === 'my-secure-token') {
        socket.user = { username: socket.handshake.query.name || 'Anonymous' }
        return next()
    }
    next(new Error('Invalid token! Connection refused.'))
})

// 3. Описуємо бізнес-логіку для дефолтного простору '/'
io.on('connection', (socket) => {
    console.log(
        `[SERVER] Клієнт ${socket.user.username} пройшов валідацію. ID сокета: ${socket.id}`,
    )

    // Слухаємо вхідні події від клієнта
    socket.on('join-room', (roomName) => {
        socket.join(roomName)
    })

    socket.on('send-message', (data) => {
        // Транслюємо повідомлення в кімнату всім, крім відправника
        socket.to(data.room).emit('new-message', {
            sender: socket.user.username,
            text: data.text,
        })
    })

    // Обробка подій життєвого циклу
    socket.on('disconnecting', (reason) => {
        console.log(`[LEAVING] Сокет ${socket.id} зараз відключиться з причини: ${reason}`)
    })

    socket.on('disconnect', () => {
        console.log(`[DISCONNECTED] Сокет ${socket.id} повністю видалено з пам'яті.`)
    })
})

// 4. Працюємо з іншим простором імен (наприклад, '/admin')
const adminSpace = io.of('/admin')
adminSpace.on('connection', (socket) => {
    console.log(`Адміністратор підключився до адмін-панелі!`)
    socket.emit('system-status', { cpu: 'good', memory: 'stable' })
})

console.log('🚀 WebSocket сервер успішно запущено на порту 8080')
