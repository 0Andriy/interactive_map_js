import http from 'node:http'
import { WSServer } from './core/Server.js'

// 1. Создаем обычный HTTP сервер
const httpServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('HTTP сервер работает.')
})

const wsApp = new WSServer({
    server: httpServer,
    path: '/ws',
    logger: console, // передаємо звичайний консольний логер
})


// 4. Запуск сервера
const PORT = 3000
httpServer.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`)
})
