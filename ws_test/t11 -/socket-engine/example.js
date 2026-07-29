import http from 'http'
import { Server } from './src/core/Server.js'
import { Heartbeat } from './src/extensions/Heartbeat.js'
import { AckManager } from './src/extensions/AckManager.js'

const httpServer = http.createServer()
const io = new Server(httpServer)

io.on('connection', (socket) => {
    // Динамічно розширюємо сокет без модифікації базового класу (Open/Closed)
    Heartbeat.attach(socket)
    AckManager.attach(socket)

    console.log(`Клієнт підключився: ${socket.id}`)

    // Робота з кімнатами
    socket.join('room1')
    io.to('room1').emit('hello', 'всім у кімнаті 1')

    // Стандартний emit/on
    socket.on('chat message', (msg) => {
        io.emit('chat message', msg)
    })

    // Отримання ACK від клієнта (якщо клієнт підтримує колбек)
    socket.on('request-data', (clientData, callback) => {
        console.log('Дані від клієнта:', clientData)
        callback({ status: 'ok', serverTime: Date.now() })
    })

    socket.on('disconnect', () => {
        console.log('Клієнт відключився')
    })
})

httpServer.listen(3000, () => console.log('Сервер запущено на порту 3000'))

import http from 'http'
import { Server } from './src/core/Server.js'
import { Heartbeat } from './src/extensions/Heartbeat.js'
import { AckManager } from './src/extensions/AckManager.js'

// 1. Створюємо інстанс БЕЗ негайного кріплення до сервера
const io = new Server()

// 2. Створюємо СТРОГІ простори імен (ззовні підключитися до неоголошених буде неможливо)
const chatNsp = io.of('/chat')
const adminNsp = io.of('/admin')

chatNsp.on('connection', (socket) => {
    // Підключаємо плагіни розширення функціоналу
    Heartbeat.attach(socket)
    AckManager.attach(socket)

    // 3. Додаємо middleware крок у ланцюжок PacketPipeline цього сокета
    socket.use((sock, packet, next) => {
        console.log(`[Ланцюжок /chat] Перевірка пакета події: ${packet.event}`)
        if (packet.event === 'spam') {
            return next(new Error('Подія заблокована фільтром спаму!'))
        }
        next()
    })

    socket.join('room-1')

    // Нативний синтаксис socket.to() (відправка всім у кімнату ОКРІМ відправника)
    socket.to('room-1').emit('user-joined', `Користувач ${socket.id} увійшов`)

    socket.on('message', async (data) => {
        // Складні ланцюжки за допомогою BroadcastOperator
        chatNsp.to('room-1').except('moderators').emit('new-msg', data)

        // Збір сокетів за критеріями через fetchSockets()
        const activeSockets = await chatNsp.to('room-1').fetchSockets()
        console.log(`Кількість активних сокетів у room-1: ${activeSockets.length}`)
    })
})

// 4. Ініціалізуємо HTTP сервер та робимо відкладений attach
const httpServer = http.createServer()

setTimeout(() => {
    io.attach(httpServer)
    httpServer.listen(3000, () => {
        console.log('🚀 WS-сервер успішно запущено на порту 3000')
    })
}, 500)
