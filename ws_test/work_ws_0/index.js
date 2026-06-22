import { Server } from './core/Server'
// import { RedisAdapter } from './adapters/RedisAdapter';
import { randomUUID } from 'crypto'

const io = new Server(3000, {
    nodeId: `node-${randomUUID()}`, // Генеруємо унікальний ID для інстансу
    // adapter: RedisAdapter,
    pathPrefix: '/socket',
})

// 3. Робота з дефолтним Namespace (io.on замість io.sockets.on)
io.sockets.on('connection', (socket) => {
    console.log('Connected to default /')
})

// =============================
// Реєструємо Namespace
const chat = io.of('/chat')

chat.use((socket, next) => {
    console.log('Middleware logic here')
    next()
})

chat.use((socket, next) => {
    const token = socket.handshake.query.token
    if (true && isValid(token)) return next()
    next(new Error('Unauthorized'))
})

chat.on('connection', async (socket) => {
    console.log('User connected:', socket.id)

    // socket.join('general')
    // const totalInLobby = await chat.fetchGlobalSize('general')
    // console.log(`Total users in lobby (all servers): ${totalInLobby}`)

    socket.on('join_room', (data) => {
        const roomName = data.room
        socket.join(roomName)
    })

    socket.on('check_room', async (roomName) => {
        const size = await chat.fetchGlobalSize(roomName)
        socket.emit('room_stats', {
            room: roomName,
            count: size,
            isEmpty: size === 0,
        })
    })

    socket.on('message', (data) => {
        // 1. Надсилаємо всім у Namespace (включаючи себе)
        chat.to('general').emit('new_msg', data)

        // 2. Надсилаємо в кімнату (тільки учасникам, крім себе)
        socket.to('general').emit('new_msg', data)
        // socket.broadcast.to('general').emit('chat_msg', msg)

        // Перевірка кількості
        // console.log(
        //     `Local: ${chat.localSize}, Global in general: ${await chat.fetchGlobalSize('general')}`,
        // )
    })

    socket.on('disconnect', () => {
        console.log('User disconnect', socket.id)
    })
})
