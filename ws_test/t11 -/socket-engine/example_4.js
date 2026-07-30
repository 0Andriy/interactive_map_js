import http from 'http'
import { Server } from './src/core/Server.js'
import { RedisAdapter } from './src/adapters/RedisAdapter.js'

const io = new Server(
    null,
    {
        path: '/ws',
        redis: { host: '127.0.0.1', port: 6379 }, // Опції передаються через об'єкт конфігу
    },
    {
        AdapterClass: RedisAdapter, // Впроваджуємо залежність (DI) без жорстких завязок
    },
)

io.on('connection', async (socket) => {
    console.log(`Підключився новий сокет: ${socket.id}`)

    // Перевіряємо: тепер у списку кімнат є кімната з назвою самого `socket.id`!
    console.log('Всі кімнати сокета:', Array.from(socket.rooms))

    // Сценарій 1: Відправити повідомлення ОДНОМУ конкретному сокету за його ID через сервер
    // Завдяки Redis, одержувач може бути підключений до зовсім іншої ноди на іншому ПК.
    const targetId = 'якийсь-uuid-іншого-користувача'
    io.to(targetId).emit('private-message', 'Привіт, це приватне повідомлення!')

    // Сценарій 2: Повноцінний міжсерверний збір даних
    socket.on('get-cluster-stats', async () => {
        // Збирає дані сокетів з УСІХ серверів у кластері за 250мс
        const allClusterSockets = await io.of('/').fetchSockets()
        console.log(`Усього сокетів у всьому кластері Redis: ${allClusterSockets.length}`)

        // Збирає сокети лише з поточного Node.js процесу (ігноруючи RPC запит у Redis)
        const localSockets = await io.of('/').local.fetchSockets()
        console.log(`З них на цій конкретній ноді: ${localSockets.length}`)
    })
})

const httpServer = http.createServer()
io.attach(httpServer)
httpServer.listen(3000)
