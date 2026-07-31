// server.js (Приклад використання регулярних виразів)
import { createServer } from 'http'
import { CustomServer as Server } from './custom-socket.io/CustomServer.js'

const httpServer = createServer()
const io = new Server(httpServer)

// 1. Оголошуємо простір імен за допомогою регулярного виразу
// Цей шаблон буде ловити URL типу: /chats/42, /chats/9991, але проігнорує /chats/abc
const chatRegExp = /^\/chats\/(\d+)$/
const dynamicChats = io.of(chatRegExp)

// 2. Глобальний Middleware для ВСІХ динамічних чатів цього шаблону
dynamicChats.use((socket, next) => {
    const currentPath = socket.namespace.name // Наприклад: '/chats/42'

    // Витягуємо ID чату з URL за допомогою регулярки
    const match = currentPath.match(chatRegExp)
    if (match) {
        socket.chatId = match[1] // Зберігаємо числовий ID (наприклад, "42") в об'єкт сокету
    }

    console.log(`[Middleware] Користувач намагається підключитися до чату №${socket.chatId}`)

    // Тут зазвичай роблять перевірку в БД: чи має цей користувач доступ до чату № socket.chatId
    const hasAccess = true
    if (hasAccess) {
        next()
    } else {
        next(new Error('Forbidden: You do not have access to this private chat'))
    }
})

// 3. Обробка події з'єднання (Connection)
dynamicChats.on('connection', (socket) => {
    const chatId = socket.chatId
    console.log(
        `🟢 Клієнт успішно зайшов у динамічний простір чату №${chatId} (Socket ID: ${socket.id})`,
    )

    // Оскільки для кожного шляху /chats/42 створюється окремий ізольований простір (Namespace),
    // виклик socket.broadcast.emit або dynamicChats.emit буде йти ТІЛЬКИ в межах чату №42!
    // Клієнти з чату /chats/43 цього повідомлення НЕ побачать.

    // Слухаємо повідомлення всередині конкретного чату
    socket.on('message:send', ({ text }, callback) => {
        const payload = {
            id: Date.now(),
            text: text,
            sender: socket.id,
        }

        // Броадкаст усім ІНШИМ учасникам САМЕ ЦЬОГО динамічного чату
        socket.broadcast.emit('message:received', payload)

        if (callback) callback({ success: true })
    })

    // Можна також створювати кімнати (Rooms) ВСЕРЕДИНІ динамічного чату!
    // Наприклад, розділити користувачів чату №42 на "модераторів" та "звичайних"
    socket.on('role:join_moderators', () => {
        socket.join('moderators_room')
        console.log(`Сокет ${socket.id} став модератором у чаті №${chatId}`)
    })

    socket.on('moderator:alert', (data) => {
        // Надіслати тільки модераторам всередині чату №42
        socket.to('moderators_room').emit('moderator:notification', data)
    })

    socket.on('disconnect', () => {
        console.log(`🔴 Клієнт залишив динамічний чат №${chatId}`)
    })
})

httpServer.listen(4000, () => console.log('Сервер RegExp чатів запущено на порту 4000'))
