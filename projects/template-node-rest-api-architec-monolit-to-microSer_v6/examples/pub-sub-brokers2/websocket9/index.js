import Redis from 'ioredis'
import { MyIoServer } from './Server.js'
import { Logger } from './Logger.js'
import { StateFactory } from './adapters/StateFactory.js'
import { BrokerFactory } from './adapters/BrokerFactory.js'

// 1. Створюємо головний логер системи
const logger = new Logger('App')

// Можемо незалежно налаштовувати кожен компонент
const stateConfig = { type: process.env.STATE_TYPE || 'memory', options: { host: '127.0.0.1' } }
const brokerConfig = { type: process.env.BROKER_TYPE || 'local', options: { host: '127.0.0.1' } }

const state = StateFactory.create(stateConfig, logger)
const broker = BrokerFactory.create(brokerConfig, logger)

const io = new MyIoServer(8080, {
    state: state.instance,
    broker: broker.instance,
    logger,
})

// 5. Працюємо з неймспейсом "/chat"
const chat = io.of('/chat')

// 1. Connection Middleware
chat.use((socket, next) => {
    const { token } = socket.handshake.query
    if (token === 'secret') {
        socket.user = { id: 1, role: 'admin' }
        next()
    } else {
        next(new Error('Unauthorized'))
    }
})

/**
 * ЗАДАЧА 1: Автоматичне привітання кожні 30 секунд у кожній кімнаті
 */
chat.on('room_created', (room) => {
    console.log(`[Plugin] Задача "Привітання" активована для ${room.name}`)

    const interval = setInterval(() => {
        chat.to(room.name).emit('presence_check', {
            text: 'Я все ще тут і стежу за порядком',
            online: room.localSockets.size,
        })
    }, 30000)

    // Коли кімната знищиться, ми маємо зупинити таймер
    chat.on('room_destroyed', (destroyedRoom) => {
        if (destroyedRoom.name === room.name) {
            clearInterval(interval)
            console.log(`[Plugin] Задача зупинена для ${room.name}`)
        }
    })
})

/**
 * ЗАДАЧА 2: Глобальний моніторинг всього неймспейсу (раз на хвилину)
 */
setInterval(() => {
    logger.info(`[Monitor] Стан неймспейсу ${chat.name}:`, {
        totalSockets: chat.localSockets.size,
        activeRooms: chat.rooms.size,
    })
}, 60000)

/**
 * ЗАДАЧА 3: Очищення застарілих даних (тільки для Leader сервера)
 */
setInterval(async () => {
    // Використовуємо Redis як замок для розподілених задач (актуально для 2026)
    const isLeader = await redisMain.set('lock:cleanup', '1', 'EX', 60, 'NX')
    if (isLeader) {
        logger.info('Виконується глобальна очистка БД...')
        // Ваша логіка очистки
    }
}, 60000)

// Обробляємо підключення нового сокета (через наш кастомний PubSub)
chat.on('connection', async (socket) => {
    logger.info(`Користувач підключився: ${socket.id}`)

    // 2. Packet Middleware
    socket.use(([event, payload], next) => {
        if (event === 'join' && payload.startsWith('admin:') && socket.user.role !== 'admin') {
            return next(new Error('Forbidden Room'))
        }
        next()
    })

    // ОТРИМАННЯ СТАНУ (Participants, Online Count)
    socket.on('get_room_info', async (roomName) => {
        const members = await chat.state.getUsersInRoom(chat.name, roomName)
        socket.rawSend({
            event: 'room_info',
            payload: { roomName, members, count: members.length },
        })
    })

    socket.on('get_global_online', async () => {
        const total = await chat.state.getCountInNamespace(chat.name)
        socket.rawSend({ event: 'online_stats', payload: { total } })
    })

    // Підписка на подію "join_room" від клієнта
    socket.on('join', async (roomName) => {
        // Додаємо сокет у кімнату (це створює об'єкт Room, якщо його немає)
        await socket.join(roomName)

        // Повідомляємо всіх у цій кімнаті про нового учасника
        // Завдяки BrokerAdapter це повідомлення побачать навіть ті,
        // хто підключений до іншого фізичного сервера.
        await chat.to(roomName).emit('system_notification', {
            message: `Користувач ${socket.id} приєднався до чату`,
            userId: socket.id,
        })
    })

    // Обробка текстового повідомлення
    socket.on('message', async (data) => {
        // data = { room: "games", text: "Привіт усім!" }
        if (!data.room || !data.text) return

        logger.debug(`Повідомлення в кімнату ${data.room}: ${data.text}`)

        // Розсилаємо повідомлення всім у кімнаті
        await chat.to(data.room).emit(
            'new_message',
            {
                text: data.text,
                time: new Date().toLocaleTimeString(),
            },
            socket.id,
        ) // Передаємо socket.id як відправника
    })

    socket.on('direct', async (data) => {
        // data.toUserId - ID отримувача (direct)
        // Навіть якщо у отримувача відкрито 3 вкладки, всі 3 отримають повідомлення
        await chat.toUser(data.toUserId).emit('private_msg', {
            from: socket.user.name,
            text: data.text,
        })
    })

    // 2. РОЗСИЛКА В КІМНАТУ
    // Всі учасники кімнати 'gamers'
    await chat.to('gamers').emit('game_start', { map: 'de_dust2' })

    // 3. РОЗСИЛКА В НЕЙМСПЕЙС
    // Всі, хто підключений до /chat (на всіх серверах)
    await chat.emitAll('maintenance', 'Чат буде перезавантажено через 5 хвилин')

    // 4. ГЛОБАЛЬНА РОЗСИЛКА (ВЕСЬ СЕРВЕР)
    // Всі сокети в усіх неймспейсах (/chat, /admin, /orders тощо)
    await io.emitGlobal('emergency_alert', 'Сервер йде на технічне обслуговування')

    // Вихід з кімнати за бажанням клієнта
    socket.on('leave', async (roomName) => {
        await socket.leave(roomName)
        await chat.to(roomName).emit('system_notification', `Користувач ${socket.id} вийшов.`)
    })


})

// 6. Обробка неймспейсу "/admin" (ізольована логіка)
const admin = io.of('/admin')
admin.on('connection', (socket) => {
    socket.on('server_status', () => {
        socket.send('status_update', { online: chat.localSockets.size })
    })
})

// Обробка коректного завершення роботи
process.on('SIGINT', async () => {
    logger.info('Завершення роботи сервера...')
    await Promise.all([io.close(), state.cleanup(), broker.cleanup()])
    process.exit(0)
})
