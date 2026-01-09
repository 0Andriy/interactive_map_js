import http from 'http'
// import { createClient } from 'redis'
import { Server } from './core/Server.js'
// import { RedisAdapter } from './RedisAdapter.js'

// // 1. Налаштування Redis для кластеризації
// const pubClient = createClient({ url: 'redis://localhost:6379' })
// const subClient = pubClient.duplicate()

// await Promise.all([pubClient.connect(), subClient.connect()])

// 2. Ініціалізація сервера
const httpServer = http.createServer()
const io = new Server(httpServer, {
    basePath: '/ws',
    // adapter: RedisAdapter,
    // pubClient,
    // subClient,
    logger: console, // Можна передати pino або winston
})

// 3. Реєстрація неймспейсів (обов'язково для безпеки, як ми домовилися)
const chatNsp = io.of('/chat')
const adminNsp = io.of('/admin')

// 4. Middleware для авторизації
chatNsp.use((ctx, next) => {
    const auth = ctx.socket.handshake.auth
    // if (auth.token === 'user-token') {
    // Заповнюємо дані користувача (вони підуть у metadata.sender)
    ctx.socket.data.user = { id: 'u1', name: 'Олексій', role: 'user' }
    next()
    // } else {
    //     next(new Error('Auth failed'))
    // }
})

// 5. Робота з підключеннями
chatNsp.on('connection', async (socket) => {
    console.log(`Сокет підключено: ${socket.id}`)

    // ПРИКЛАД 1: Перевірка чи є сокет учасником кімнати перед відправкою
    socket.on('send_to_room', (data) => {
        const targetRoom = data.room

        if (socket.hasRoom(targetRoom)) {
            // Відправка всім у кімнаті, крім себе
            socket.to(targetRoom).emit('message', {
                text: data.text,
                info: 'Ви отримали це, бо ви в цій кімнаті',
            })
        } else {
            // Відправка персонально собі (error message)
            socket.emit('error', `Ви не можете писати в кімнату ${targetRoom}, бо ви не її учасник`)
        }
    })

    // ПРИКЛАД 2: Складні ланцюжки (Chaining)
    socket.on('broadcast_complex', (data) => {
        socket.broadcast
            .to('news')
            .to('alerts')
            .except('muted_users')
            .emit('global_alert', { msg: 'Увага всім!' })
    })

    // ПРИКЛАД 3: Отримання всіх кімнат сокета
    socket.on('my_rooms', () => {
        socket.emit('rooms_list', {
            rooms: socket.rooms,
        })
    })

    // ПРИКЛАД 4: Керування кімнатами
    socket.on('join_room', (data) => {
        const roomName = data.room

        socket.join(roomName)
        socket.emit('joined', roomName)
    })

    socket.on('leave_room', (room) => {
        socket.leave(room)
    })

    // ПРИКЛАД 5: Кластерний fetchSockets (збирає дані з усіх серверів Redis)
    socket.on('get_room_members', async (room) => {
        const sockets = await chatNsp.in(room).fetchSockets()
        const members = sockets.map((s) => s.data.user?.name || s.id)
        socket.emit('members_list', { room, members })
    })
})

// 6. Глобальні операції (через об'єкт io)
// Відправка з сервера в конкретний неймспейс та кімнату
setInterval(async () => {
    // Перевіряємо кількість людей в кімнаті перед розсилкою
    const count = io.of('/chat').getRoomSize('general')

    if (count > 0) {
        io.of('/chat').to('general').emit('system_update', {
            online: count,
            timestamp: Date.now(),
        })
    }
}, 10000)

// 7. Спеціальний неймспейс для адмінів
adminNsp.on('connection', (socket) => {
    socket.on('kick_user', async (userId) => {
        // Пошук сокета по всьому кластеру
        const allSockets = await chatNsp.fetchSockets()
        const target = allSockets.find((s) => s.data.user?.id === userId)

        if (target) {
            // Оскільки fetchSockets повертає дані, для відключення
            // треба знати id сокета і послати йому команду (або реалізувати remoteDisconnect)
            adminNsp.emit('log', `Користувача ${userId} знайдено.`)
        }
    })
})

// Запуск сервера
const PORT = 3000
httpServer.listen(PORT, () => {
    console.log(`Сервер запущено на http://localhost:${PORT}`)
    console.log(`WebSocket шлях: ${io.options.basePath}`)
})
