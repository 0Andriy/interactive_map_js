import winston from 'winston' // Припускаємо, що тут ваш адаптер
import { StateFactory } from './factories/StateFactory.js'
import { BrokerFactory } from './factories/BrokerFactory.js'
import { WSServer } from './core/Server.js'

// 1. Конфігурація системи (2026 Ready)
const config = {
    port: parseInt(process.env.PORT || '3000', 10),
    basePath: '/ws', // Базовий шлях для всіх підключень
    state: {
        driver: process.env.STATE_DRIVER || 'memory',
        options: {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
        },
    },
    broker: {
        driver: process.env.BROKER_DRIVER || 'memory',
        options: {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
        },
    },
}

const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...metadata }) => {
            // Перевіряємо, чи є додаткові дані (об'єкти)
            let msg = `${timestamp} [${level}]: ${message}`
            if (Object.keys(metadata).length > 0) {
                msg += ` ${JSON.stringify(metadata)}`
            }
            return msg
        }),
        // Для виводу кольорів у терміналі додайте:
        winston.format.colorize({ all: true }),
    ),
    transports: [new winston.transports.Console()],
})

async function bootstrap() {
    logger.info('Starting IO System bootstrap...', { version: '2026.1.0' })

    try {
        // 2. Створення адаптерів
        const stateAdapter = StateFactory.create(config.state, logger)
        const brokerAdapter = await BrokerFactory.create(config.broker, logger)

        // 3. Ініціалізація WSServer
        // Тепер передаємо об'єкт опцій згідно з новою архітектурою
        const io = new WSServer({
            port: config.port,
            path: config.basePath,
            stateAdapter,
            brokerAdapter,
            logger,
        })

        // 4. Налаштування неймспейсу "/chat"
        // Повний шлях для клієнта буде: ws://host:3000/socket-api/chat
        const chatNs = io.of('/chat')

        // // Middleware: Автентифікація
        // chatNs.use(async (ctx, next) => {
        //     const { socket } = ctx
        //     const token = socket.handshake.query.token

        //     if (token === 'senior-secret') {
        //         // Емуляція отримання юзера з БД
        //         socket.user = { id: 'user_777', name: 'Senior Dev', role: 'admin' }
        //         return next()
        //     }

        //     logger.warn('Auth failed for socket', { socketId: socket.id })
        //     throw new Error('Authentication failed: Invalid Token')
        // })

        // // Middleware: Логування активності неймспейсу
        // chatNs.use(async (ctx, next) => {
        //     const start = Date.now()
        //     await next()
        //     logger.debug?.(`Namespace logic processed in ${Date.now() - start}ms`)
        // })

        // Обробка подій неймспейсу
        chatNs.on('connection', (socket) => {
            const user = {
                ...socket.user,
            }

            logger.info(`User ${user.name} connected to ${chatNs.name}`, {
                socketId: socket.id,
                uptime: socket.uptime,
            })

            // Обробка вхідних повідомлень через внутрішній PubSub сокета
            socket.on('chat:message', async (payload) => {
                logger.info(`Message received from ${socket.id}`, { payload })

                // Розсилка всім у кімнаті (включаючи інші сервери в кластері)
                // Захист від ECHO реалізовано всередині Room.broadcast
                await chatNs.to(payload.room).emit(
                    'chat:message',
                    {
                        text: payload.text,
                        from: user.name,
                        time: new Date(),
                    },
                    // socket.id,
                )
            })

            socket.on('room:join', async (payload) => {
                const { room: roomName } = payload
                await socket.join(roomName)

                // Отримуємо кількість учасників (глобально)
                const room = chatNs.rooms.get(roomName)
                const count = await room.getMemberCount()

                chatNs.to(roomName).emit('room:announcement', {
                    message: `${user.name} joined the room`,
                    totalMembers: count,
                })
            })

            socket.on('room:leave', async (payload) => {
                const { room: roomName } = payload

                // 1. Отримуємо об'єкт кімнати ДО того, як вийдемо з неї
                const room = chatNs.rooms.get(roomName)
                if (!room) return

                // 2. Отримуємо кількість (можна відняти 1 для точності)
                const currentCount = await room.getMemberCount()

                // 3. Оголошуємо про вихід ВСІМ (включаючи того, хто виходить)
                // Або використовуємо broadcast, щоб не слати самому собі
                await chatNs.to(roomName).emit('room:announcement', {
                    message: `${user.name} left the room`,
                    totalMembers: Math.max(0, currentCount - 1),
                })

                // 4. ТІЛЬКИ ТЕПЕР покидаємо кімнату
                await socket.leave(roomName)
            })
        })

        // 5. Глобальний неймспейс для системних повідомлень
        const sysNs = io.of('/system')
        sysNs.on('connection', (socket) => {
            socket.emit('sys:status', { serverId: io.serverId, online: true })
        })

        // 6. Graceful Shutdown
        const shutdown = async (signal) => {
            logger.info(`Received ${signal}. Starting graceful shutdown...`)

            // Встановлюємо таймаут на примусове завершення
            const timeout = setTimeout(() => {
                logger.error('Shutdown timed out, forcing exit')
                process.exit(1)
            }, 10000)

            try {
                await io.close()
                logger.info('IO Server closed cleanly')
                process.exit(0)
            } catch (err) {
                logger.error('Error during shutdown', { error: err.message })
                process.exit(1)
            } finally {
                clearTimeout(timeout)
            }
        }

        process.on('SIGTERM', () => shutdown('SIGTERM'))
        process.on('SIGINT', () => shutdown('SIGINT'))

        logger.info('WSServer Bootstrap Successful', {
            port: config.port,
            basePath: config.basePath,
            env: process.env.NODE_ENV || 'development',
        })
    } catch (error) {
        logger.error('Critical Bootstrap Error', {
            message: error.message,
            stack: error.stack,
        })
        process.exit(1)
    }
}

// Запуск
bootstrap()
