import http from 'http'
import { Server } from './core/Server.js'

const httpServer = http.createServer()
const io = new Server(httpServer, {
    basePath: '/ws',
    logger: console,
})

const chatNsp = io.of('/chat')

// --- ДОПОМІЖНА ФУНКЦІЯ ДЛЯ СТРУКТУРИ { event, data } ---
// Це гарантує, що клієнт завжди отримує однаковий формат
const wrapEmit = (socketOrNsp, event, data) => {
    socketOrNsp.emit(event, { event, ...data, timestamp: Date.now() })
}

// --- ФУНКЦІЯ ОНОВЛЕННЯ СТАТУСУ КІМНАТИ ---
const broadcastRoomUpdate = (roomName) => {
    const size = chatNsp.getRoomSize(roomName)
    // Надсилаємо всім у кімнаті актуальну кількість учасників
    wrapEmit(chatNsp.to(roomName), 'room_stats', {
        room: roomName,
        onlineCount: size,
    })
}

chatNsp.use((ctx, next) => {
    // Емуляція авторизації
    ctx.socket.data.user = {
        id: `Guest-${ctx.socket.id.slice(0, 4)}`,
        name: `Guest_${ctx.socket.id.slice(0, 4)}`,
    }
    next()
})

chatNsp.on('connection', async (socket) => {
    const user = socket.data.user
    console.log(`Connected: ${user.name}`)

    // 1. Повідомляємо самого користувача про успішне підключення
    wrapEmit(socket, 'connection_established', {
        welcome: `Вітаємо, ${user.name}`,
        yourId: user.id,
    })

    // 2. ПРИЄДНАННЯ ДО КІМНАТИ
    socket.on('join_room', (payload) => {
        const roomName = payload.room
        if (!roomName) return

        socket.join(roomName)

        // Інформуємо учасників кімнати
        wrapEmit(socket.to(roomName), 'user_joined', {
            userId: user.id,
            userName: user.name,
            message: `${user.name} приєднався до чату`,
        })

        // Надсилаємо оновлену статистику кімнати
        broadcastRoomUpdate(roomName)

        // Підтвердження самому користувачу
        wrapEmit(socket, 'joined_success', { room: roomName })
    })

    // 3. ВИХІД З КІМНАТИ
    socket.on('leave_room', (payload) => {
        const roomName = payload.room
        if (socket.hasRoom(roomName)) {
            socket.leave(roomName)

            wrapEmit(socket.to(roomName), 'user_left', {
                userId: user.id,
                userName: user.name,
            })

            broadcastRoomUpdate(roomName)
        }
    })

    // 4. ПОВІДОМЛЕННЯ В КІМНАТУ (ЧАТ)
    socket.on('send_message', (payload) => {
        const { room, text } = payload
        if (socket.hasRoom(room)) {
            // Розсилка всім у кімнаті (включаючи себе або через socket.to().emit для інших)
            wrapEmit(chatNsp.to(room), 'new_message', {
                senderId: user.id,
                senderName: user.name,
                text: text,
            })
        }
    })

    // 5. ТАЙПІНГ (TYPING INDICATOR)
    socket.on('typing_start', (payload) => {
        // Повідомляємо інших у кімнаті, що ми пишемо
        socket.to(payload.room).emit('user_typing', {
            event: 'user_typing',
            data: { userId: user.id, userName: user.name, isTyping: true },
        })
    })

    // socket.on('typing_stop', (payload) => {
    //     // Повідомляємо інших у кімнаті, що ми ПЕРЕСТАЛИ писати
    //     socket.to(payload.room).emit('user_typing', {
    //         event: 'user_typing',
    //         data: { userId: user.id, userName: user.name, isTyping: false },
    //     })
    // })

    // 6. ГЛОБАЛЬНА РОЗСИЛКА (Наприклад, оголошення від адміна)
    socket.on('broadcast', (payload) => {
        // Відправляємо взагалі всім у неймспейсі /chat
        wrapEmit(chatNsp, 'global_announcement', {
            content: payload.message,
        })
    })

    // 7. ОБРОБКА ВІДКЛЮЧЕННЯ (Disconnect)
    socket.on('disconnect', () => {
        // Автоматично проходимо по всіх кімнатах, де був сокет, щоб оновити лічильники
        // В деяких реалізаціях socket.rooms очищується миттєво,
        // тому список кімнат варто зберігати в socket.data.myRooms
        console.log(`User ${user.name} disconnected`)
    })
})

// Глобальний інтервал для моніторингу загального онлайну (приклад 2026 року)
setInterval(() => {
    const totalOnline = chatNsp.sockets.size // або метод вашого Server.js
    if (totalOnline > 0) {
        wrapEmit(chatNsp, 'server_metrics', { onlineTotal: totalOnline })
    }
}, 30000)

const PORT = 3000
httpServer.listen(PORT, () => {
    console.log(`Server 2026 active on port ${PORT}`)
})
