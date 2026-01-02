/**
 * @file Точка входу та Composition Root системи.
 * @version 2026.1.0
 */

// import pino from 'pino' // Використовуємо високопродуктивний логер
import { Logger } from './Logger.js'
import { StateFactory } from './factories/StateFactory.js'
import { BrokerFactory } from './factories/BrokerFactory.js'
import { MyIoServer } from './core/Server.js'

const logger = new Logger('App')

/**
 * Конфігурація системи (зазвичай завантажується з process.env або .env файлу)
 */
const config = {
    port: parseInt(process.env.PORT || '3000', 10),
    state: {
        driver: process.env.STATE_DRIVER || 'memory', // 'redis' або 'memory'
        options: {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
        },
    },
    broker: {
        driver: process.env.BROKER_DRIVER || 'memory', // 'redis' або 'memory'
        options: {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
        },
    },
}

/**
 * Основна функція запуску сервера
 */
async function bootstrap() {
    // 1. Ініціалізація логера (Pino — стандарт швидкості у 2026)
    // const logger = pino({
    //     level: process.env.LOG_LEVEL || 'info',
    //     transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
    // })

    logger.info('Starting IO System bootstrap...')

    try {
        // 2. Створення адаптерів через фабрики
        const stateAdapter = StateFactory.create(config.state, logger)
        const brokerAdapter = await BrokerFactory.create(config.broker, logger)

        // 3. Ініціалізація ядра сервера
        const io = new MyIoServer(config.port, {
            stateAdapter,
            brokerAdapter,
            logger,
        })

        // 4. Приклад налаштування неймспейсу та бізнес-логіки
        const mainNs = io.of('/main')

        // Middleware для автентифікації (приклад)
        mainNs.use(async (socket, next) => {
            // return next()
            // const token = socket.handshake.query.token
            // if (token === 'secret') {
            //     socket.user = { id: 'user_1', name: 'Senior Developer' }
            //     return next()
            // }
            // next(new Error('Authentication failed'))
        })

        mainNs.on('connection', (socket) => {
            logger.info(`User ${socket.user?.id} connected to /main`)

            socket.on('message', async (payload) => {
                // Розсилка в кімнату через брокер (працює на всіх серверах)
                // await mainNs.to('chat_room').emit(
                //     'chat:message',
                //     {
                //         text: payload.text,
                //         user: socket.user.name,
                //     },
                //     socket.id,
                // )
                // await mainNs.broadcast(
                //     'message',
                //     {
                //         text: payload.text,
                //         user: socket.user.name,
                //     },
                //     socket.id,
                // )
            })

            socket.on('join', async (room) => {
                await socket.join(room)
            })
        })

        // 5. Обробка Graceful Shutdown (завершення роботи)
        const shutdown = async (signal) => {
            logger.info(`Received ${signal}. Shutting down gracefully...`)
            await io.close()
            process.exit(0)
        }

        process.on('SIGTERM', () => shutdown('SIGTERM'))
        process.on('SIGINT', () => shutdown('SIGINT'))

        logger.info(`IO Server successfully bootstrapped and listening on port ${config.port}`)
    } catch (error) {
        logger.error('Critical error during bootstrap:', error)
        process.exit(1)
    }
}

// Запуск програми
bootstrap()
