import { createServer } from 'http'
import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'

const httpServer = createServer()
const io = new Server(httpServer, {
    cors: {
        origin: 'http://localhost:3000', // Налаштуйте під свій фронтенд
        methods: ['GET', 'POST'],
        credentials: true,
    },
    pingTimeout: 60000, // Закриття з'єднання, якщо клієнт не відповів за 60с
    pingInterval: 25000, // Інтервал перевірки зв'язку
})

const JWT_SECRET = 'your_super_secret_key' // У продакшені беріть з process.env

// 1. Створення виділеного простору імен (Namespace) для чату
const chatNamespace = io.of('/chat')

// 2. Middleware для авторизації (Нюанс: безпека понад усе)
chatNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization

    if (!token) {
        return next(new Error('Authentication error: Token missing'))
    }

    try {
        // Валідація токена. Очікуємо об'єкт { id, username }
        const decoded = jwt.verify(token.replace('Bearer ', ''), JWT_SECRET)
        socket.user = decoded // Зберігаємо дані користувача в об'єкті сокета
        next()
    } catch (err) {
        return next(new Error('Authentication error: Invalid token'))
    }
})

// 3. Обробка подій всередині простору імен
chatNamespace.on('connection', (socket) => {
    const { id: userId, username } = socket.user
    console.log(`User connected: ${username} (${userId}) with socket ID: ${socket.id}`)

    // Нюанс: створюємо персональну кімнату для юзера за його ID (для приватних повідомлень між девайсами)
    socket.join(`user:${userId}`)

    // ПОДІЯ: Приєднання до кімнати чату (кімнати всередині namespace)
    socket.on('room:join', ({ roomId }, callback) => {
        try {
            // Валідація вхідних даних
            if (!roomId) throw new Error('Room ID is required')

            // Виходимо з попередніх кімнат чату, якщо необхідно (окрім власної особистої кімнати)
            for (const room of socket.rooms) {
                if (room !== socket.id && room !== `user:${userId}`) {
                    socket.leave(room)
                }
            }

            socket.join(roomId)

            // Сповіщаємо інших учасників кімнати
            socket.to(roomId).emit('room:notification', {
                text: `Користувач ${username} приєднався до чату.`,
            })

            // Нюанс: використовуємо callback (Acknowledgement) для підтвердження успіху клієнту
            callback({ success: true, message: `Joined room ${roomId}` })
        } catch (error) {
            callback({ success: false, error: error.message })
        }
    })

    // ПОДІЯ: Відправка повідомлення в конкретну кімнату
    socket.on('message:send', ({ roomId, messageText }, callback) => {
        try {
            if (!roomId || !messageText?.trim()) {
                throw new Error('Invalid room ID or empty message')
            }

            // Перевірка: чи дійсно користувач перебуває в цій кімнаті (Нюанс безпеки)
            if (!socket.rooms.has(roomId)) {
                throw new Error('Forbidden: You are not a member of this room')
            }

            const payload = {
                id: crypto.randomUUID(), // ES6/Node.js сучасний генератор ID
                sender: { userId, username },
                text: messageText,
                createdAt: new Date().toISOString(),
            }

            // Надсилаємо всім у кімнаті, ВКЛЮЧАЮЧИ відправника (якщо треба всім, крім нього — використовуйте socket.to(roomId).emit)
            chatNamespace.to(roomId).emit('message:received', payload)

            callback({ success: true, msgId: payload.id })
        } catch (error) {
            callback({ success: false, error: error.message })
        }
    })

    // ПОДІЯ: Приватне повідомлення конкретному користувачу (UserID)
    socket.on('message:private', ({ targetUserId, messageText }, callback) => {
        try {
            if (!targetUserId || !messageText?.trim()) throw new Error('Missing target or message')

            const payload = {
                id: crypto.randomUUID(),
                sender: { userId, username },
                text: messageText,
                isPrivate: true,
                createdAt: new Date().toISOString(),
            }

            // Надсилаємо в персональну кімнату цільового користувача
            chatNamespace.to(`user:${targetUserId}`).emit('message:private_received', payload)

            // Надсилаємо також у власну кімнату відправника (щоб синхронізувати його інші вкладки/пристрої)
            socket.to(`user:${userId}`).emit('message:private_received', payload)

            callback({ success: true })
        } catch (error) {
            callback({ success: false, error: error.message })
        }
    })

    // ПОДІЯ: Користувач починає друкувати (Тайпінг)
    socket.on('room:typing', ({ roomId, isTyping }) => {
        // Надсилаємо всім у кімнаті, ОКРІМ самого автора події
        socket.to(roomId).emit('room:typing_status', { userId, username, isTyping })
    })

    // ПОДІЯ: Тимчасова втрата зв'язку (disconnecting — кімнати ще доступні)
    socket.on('disconnecting', () => {
        console.log(`User ${username} is disconnecting from rooms:`, socket.rooms)
        // Можна зафіксувати, з яких кімнат людина виходить, та надіслати сповіщення
        socket.rooms.forEach((room) => {
            if (room !== socket.id && room !== `user:${userId}`) {
                socket
                    .to(room)
                    .emit('room:notification', { text: `Користувач ${username} залишив чат.` })
            }
        })
    })

    // ПОДІЯ: Повне відключення (disconnect — кімнат уже немає в socket.rooms)
    socket.on('disconnect', (reason) => {
        console.log(`Socket ${socket.id} disconnected. Reason: ${reason}`)

        // Нюанс: обробка критичних помилок з'єднання
        if (reason === 'server namespace disconnect') {
            // Клієнта вигнав сервер
        }
    })

    // Кастомна обробка помилок сокету
    socket.on('error', (err) => {
        console.error(`Socket error on id ${socket.id}:`, err)
    })
})

// Запуск сервера
const PORT = process.env.PORT || 4000
httpServer.listen(PORT, () => {
    console.log(`Socket.io JS server running on port ${PORT}`)
})
