// index.js
import Redis from 'ioredis'
import { MyIoServer } from './Server.js'
import { Logger } from './Logger.js'
import { RedisStateAdapter } from './adapters/StateAdapter.js'
import { RedisBrokerAdapter } from './adapters/BrokerAdapter.js'

const logger = new Logger('App')

// 1. Налаштування Redis (2026 Ready)
const redisOpts = { host: 'localhost', port: 6379 }
const redisMain = new Redis(redisOpts)
const redisPub = new Redis(redisOpts)
const redisSub = new Redis(redisOpts)

// 2. Ініціалізація адаптерів
const stateAdapter = new RedisStateAdapter(redisMain, logger)
const brokerAdapter = new RedisBrokerAdapter(redisPub, redisSub, logger)

// 3. Створення сервера
const io = new MyIoServer(8080, {
    stateAdapter,
    brokerAdapter,
    logger,
})

// 4. Бізнес-логіка
const chat = io.of('/chat')

chat.on('connection', (socket) => {
    logger.info(`User connected: ${socket.id}`)

    socket.on('join_room', async (room) => {
        await socket.join(room)
        await chat.to(room).emit('system_msg', `User ${socket.id} joined!`)
    })

    socket.on('message', async (data) => {
        // data = { room: 'general', text: 'Hello' }
        await chat.to(data.room).emit('chat_msg', data.text, socket.id)
    })
})
