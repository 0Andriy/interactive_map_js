import { createServer } from 'http'
import { Server } from 'socket.io'
import { createClient } from 'redis'
import { createAdapter } from '@socket.io/redis-adapter'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'

const httpServer = createServer()
const io = new Server(httpServer, {
    cors: {
        origin: '*', // У продакшені замініть на конкретний домен вашого фронтенду
        methods: ['GET', 'POST'],
        credentials: true,
    },
    pingTimeout: 30000, // Закриття з'єднання, якщо клієнт не відповів за 30с
    pingInterval: 15000, // Інтервал перевірки зв'язку (серцебиття)
})

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key'

// ==========================================
// 1. МАСШТАБОВАНІСТЬ (Redis Adapter)
// ==========================================
const pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' })
const subClient = pubClient.duplicate()

try {
    await Promise.all([pubClient.connect(), subClient.connect()])
    io.adapter(createAdapter(pubClient, subClient))
    console.log('✅ Redis Adapter успішно підключено. Готовий до кластеризації.')
} catch (err) {
    console.error('❌ Помилка Redis Adapter:', err.message)
    console.log('⚠️ Сервер працює локально (без горизонтального масштабування).')
}

// Імітація бази даних в оперативній пам'яті (у продакшені — MongoDB, PostgreSQL тощо)
const messageHistory = new Map() // roomId -> Array of messages
const onlineUsers = new Set() // Глобальний список ID користувачів в мережі
const rateLimiter = new Map() // socket.id -> timestamp останнього повідомлення

// Створення виділеного простору імен для чату
const chatNamespace = io.of('/chat')

// ==========================================
// 2. MIDDLEWARE АВТОРИЗАЦІЇ (JWT & Ролі)
// ==========================================
chatNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization

    if (!token) {
        return next(new Error('Authentication error: Token missing'))
    }

    try {
        // Очікуємо в токені payload: { id, username, role: 'user'|'admin'|'moderator' }
        const cleanedToken = token.replace('Bearer ', '')
        const decoded = jwt.verify(cleanedToken, JWT_SECRET)

        socket.user = decoded // Записуємо дані користувача безпосередньо в сокет
        next()
    } catch (err) {
        return next(new Error('Authentication error: Invalid or expired token'))
    }
})

// ==========================================
// 3. ОБРОБКА ПОДІЙ ПРОСТОРУ ЧАТУ
// ==========================================
chatNamespace.on('connection', async (socket) => {
    const { id: userId, username, role } = socket.user
    const isAdminOrMod = role === 'admin' || role === 'moderator'

    // Логіка присутності (Presence)
    onlineUsers.add(userId)
    socket.join(`user:${userId}`) // Персональна кімната юзера для мультидевайсності

    // Сповіщаємо всіх користувачів, що юзер зайшов в мережу
    socket.broadcast.emit('user:status_changed', { userId, status: 'online' })
    console.log(`🟢 Користувач підключився: ${username} (${role}) | Socket: ${socket.id}`)

    // ------------------------------------------
    // А. РОБОТА З КІМНАТАМИ ТА ІСТОРІЄЮ
    // ------------------------------------------

    // Приєднання до кімнати чату
    socket.on('room:join', ({ roomId }, callback) => {
        try {
            if (!roomId) throw new Error('ID кімнати є обовʼязковим')

            socket.join(roomId)

            socket.to(roomId).emit('room:notification', {
                text: `Користувач ${username} приєднався до чату.`,
            })

            callback({ success: true, message: `Успішно увійшли в кімнату ${roomId}` })
        } catch (error) {
            callback({ success: false, error: error.message })
        }
    })

    // Запит історії повідомлень з пагінацією (по часу)
    socket.on('room:get_history', ({ roomId, limit = 20, beforeTimestamp }, callback) => {
        try {
            if (!socket.rooms.has(roomId))
                throw new Error('Заборонено: Ви не є учасником цієї кімнати')

            let roomMessages = messageHistory.get(roomId) || []

            if (beforeTimestamp) {
                roomMessages = roomMessages.filter(
                    (m) => new Date(m.createdAt) < new Date(beforeTimestamp),
                )
            }

            const sliceOfMessages = roomMessages.slice(-limit)
            callback({ success: true, messages: sliceOfMessages })
        } catch (err) {
            callback({ success: false, error: err.message })
        }
    })

    // Залишення кімнати користувачем добровільно
    socket.on('room:leave', ({ roomId }, callback) => {
        try {
            if (socket.rooms.has(roomId)) {
                socket.leave(roomId)
                socket
                    .to(roomId)
                    .emit('room:notification', { text: `Користувач ${username} залишив чат.` })
            }
            callback({ success: true })
        } catch (err) {
            callback({ success: false, error: err.message })
        }
    })

    // ------------------------------------------
    // Б. ОБМІН ПОВІДОМЛЕННЯМИ (Валідація та Безпека)
    // ------------------------------------------

    // Надсилання текстового повідомлення
    socket.on('message:send', ({ roomId, messageText }, callback) => {
        try {
            // 🛑 Anti-Spam Rate Limiting (Макс 1 повідомлення в 500мс)
            const now = Date.now()
            const lastMsgTime = rateLimiter.get(socket.id) || 0
            if (now - lastMsgTime < 500) {
                throw new Error('Занадто багато повідомлень! Зачекайте.')
            }
            rateLimiter.set(socket.id, now)

            // 🛑 Валідація тексту
            if (!roomId || !messageText?.trim())
                throw new Error('Повідомлення не може бути порожнім')
            if (messageText.length > 1000)
                throw new Error('Повідомлення занадто довге (макс 1000 симв.)')
            if (!socket.rooms.has(roomId))
                throw new Error('Заборонено: Ви не перебуваєте в цій кімнаті')

            // 🛑 Санітизація тексту (простий захист від XSS інʼєкцій)
            const sanitizedText = messageText
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')

            const payload = {
                id: crypto.randomUUID(),
                sender: { userId, username },
                text: sanitizedText,
                createdAt: new Date().toISOString(),
            }

            // Збереження в історію
            if (!messageHistory.has(roomId)) messageHistory.set(roomId, [])
            messageHistory.get(roomId).push(payload)

            // Розсилка всім у кімнаті
            chatNamespace.to(roomId).emit('message:received', payload)
            callback({ success: true, msgId: payload.id })
        } catch (error) {
            callback({ success: false, error: error.message })
        }
    })

    // Надсилання бінарних файлів (Зображення / Аудіо до 2MB)
    socket.on('message:file', ({ roomId, fileBuffer, fileName, fileType }, callback) => {
        try {
            if (!socket.rooms.has(roomId)) throw new Error('Заборонено')
            if (fileBuffer.length > 2 * 1024 * 1024)
                throw new Error('Файл занадто великий (макс 2MB)')

            const payload = {
                id: crypto.randomUUID(),
                sender: { userId, username },
                file: { data: fileBuffer, name: fileName, type: fileType },
                createdAt: new Date().toISOString(),
            }

            chatNamespace.to(roomId).emit('message:received', payload)
            callback({ success: true })
        } catch (err) {
            callback({ success: false, error: err.message })
        }
    })

    // Статус друку (Typing)
    socket.on('room:typing', ({ roomId, isTyping }) => {
        socket.to(roomId).emit('room:typing_status', { userId, username, isTyping })
    })

    // Видалення повідомлення автором
    socket.on('message:delete', ({ roomId, messageId }, callback) => {
        try {
            if (!messageHistory.has(roomId)) throw new Error('Кімнату не знайдено')

            // Імітація пошуку та перевірки автора в БД
            const messages = messageHistory.get(roomId)
            const msgIndex = messages.findIndex((m) => m.id === messageId)

            if (msgIndex === -1) throw new Error('Повідомлення не знайдено')
            if (messages[msgIndex].sender.userId !== userId && !isAdminOrMod) {
                throw new Error('У вас немає прав на видалення цього повідомлення')
            }

            // Видаляємо з історії
            messages.splice(msgIndex, 1)

            chatNamespace.to(roomId).emit('message:deleted', { messageId })
            callback({ success: true })
        } catch (err) {
            callback({ success: false, error: err.message })
        }
    })

    // ------------------------------------------
    // В. АДМІНІСТРАТИВНІ ТА МОДЕРАТОРСЬКІ ПОДІЇ
    // ------------------------------------------

    // Глобальне сповіщення (Броадкаст на весь застосунок)
    socket.on('admin:global_broadcast', ({ title, text }, callback) => {
        try {
            if (!isAdminOrMod) throw new Error('Заборонено: Тільки для адміністрації')
            if (!text?.trim()) throw new Error('Текст повідомлення обовʼязковий')

            chatNamespace.emit('system:global_announcement', {
                id: crypto.randomUUID(),
                title: title || 'Важливе сповіщення сервісу',
                text: text,
                createdAt: new Date().toISOString(),
            })

            callback({ success: true })
        } catch (err) {
            callback({ success: false, error: err.message })
        }
    })

    // Кік користувача з конкретної кімнати
    socket.on('admin:kick_user', async ({ roomId, targetUserId, reason }, callback) => {
        try {
            if (!isAdminOrMod) throw new Error('Заборонено')
            if (!roomId || !targetUserId) throw new Error('Неповні дані для кіку')

            // Шукаємо сокети цільового користувача через його персональну кімнату (працює і в Redis)
            const targetSockets = await chatNamespace.in(`user:${targetUserId}`).fetchSockets()

            targetSockets.forEach((targetSocket) => {
                if (targetSocket.rooms.has(roomId)) {
                    targetSocket.leave(roomId)
                    targetSocket.emit('user:kicked_notification', { roomId, reason })
                }
            })

            chatNamespace.to(roomId).emit('room:notification', {
                text: `Користувача ${targetUserId} було вигнано модератором. Причина: ${reason || 'Не вказана'}`,
            })
            callback({ success: true })
        } catch (err) {
            callback({ success: false, error: err.message })
        }
    })

    // Повний бан користувача (Примусовий Disconnect + Блокування)
    socket.on('admin:ban_user', async ({ targetUserId, reason }, callback) => {
        try {
            if (!isAdminOrMod) throw new Error('Заборонено')
            // 🛑 ТУТ: Запис бана в реальну БД, щоб Middleware авторизації не пропустив його знову.
            const targetSockets = await chatNamespace.in(`user:${targetUserId}`).fetchSockets()
            targetSockets.forEach((targetSocket) => {
                targetSocket.emit('user:banned_notification', { reason })
                targetSocket.disconnect(true)
                // Примусово розриваємо з'єднання
            })
            callback({ success: true })
        } catch (err) {
            callback({ success: false, error: err.message })
        }
    })

    // Отримання поточної системної статистики для адмін-панелі
    socket.on('admin:get_server_stats', async (callback) => {
        try {
            if (!isAdminOrMod) throw new Error('Заборонено')
            // Рахуємо всі активні сокети в нашому кластері
            const allSockets = await chatNamespace.fetchSockets()
            callback({
                success: true,
                stats: {
                    totalActiveConnections: allSockets.length,
                    totalUniqueOnlineUsers: onlineUsers.size,
                    localMemoryRoomsCount: messageHistory.size,
                },
            })
        } catch (err) {
            callback({ success: false, error: err.message })
        }
    })
    // ------------------------------------------
    // Г. ЖИТТЄВИЙ ЦИКЛ З'ЄДНАННЯ (Disconnect)
    // ------------------------------------------

    // Етап відключення сокету (кімнати користувача ще доступні в socket.rooms)
    socket.on('disconnecting', () => {
        socket.rooms.forEach((room) => {
            if (room !== socket.id && room !== `user:${userId}`) {
                socket.to(room).emit('room:notification', {
                    text: `Користувач ${username} тимчасово залишив мережу. `,
                })
            }
        })
    })

    // Повне відключення сокету
    socket.on('disconnect', async (reason) => {
        rateLimiter.delete(socket.id)

        // Нюанс мультидевайсності: перевіряємо чи є інші активні вкладки цього юзера
        const activeSockets = await chatNamespace.in(`user:${userId}`).fetchSockets()
        if (activeSockets.length === 0) {
            onlineUsers.delete(userId)
            // Сповіщаємо всіх, що юзер повністю офлайн
            socket.broadcast.emit('user:status_changed', { userId, status: 'offline' })
            console.log(`🔴 Користувач повністю офлайн: ${username}`)
        }
    })
    socket.on('error', (err) => {
        console.error(`🚨 Критична помилка сокету для ${username}:`, err)
    })
})

// Запобігання падінню Node.js процесу через невідловлені помилки
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection:', reason)
})
const PORT = process.env.PORT || 4000
httpServer.listen(PORT, () => {
    console.log(`🚀 ЕS6 Socket.io чат-сервер успішно запущено на порту ${PORT}`)
})
