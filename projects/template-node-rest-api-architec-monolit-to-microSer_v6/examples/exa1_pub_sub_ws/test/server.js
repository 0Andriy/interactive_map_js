// server.js
import http from 'http'
import { WebSocket, WebSocketServer } from 'ws'

// 1. Створюємо звичайний HTTP сервер
const server = http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('Hello from HTTP server! This port also handles WebSockets.')
    } else {
        res.writeHead(404)
        res.end('Not Found')
    }
})

// 2. Створюємо WebSocket сервер з noServer: true
const wss = new WebSocketServer({ noServer: true })

wss.on('connection', (ws) => {
    console.log('Client connected via WebSocket')

    ws.on('message', (message) => {
        console.log(`Received message from client: ${message}`)

        // Відправляємо повідомлення назад усім підключеним клієнтам
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(`Server received: ${message}`, { binary: true })
            }
        })
    })

    ws.on('close', () => {
        console.log('Client disconnected from WebSocket')
    })

    ws.on('error', (error) => {
        console.error('WebSocket error:', error)
    })

    ws.send('Welcome to the WebSocket server (integrated mode)!')
})

// 3. Обробляємо події 'upgrade' від HTTP сервера для WebSockets
server.on('upgrade', (request, socket, head) => {
    // Цей шлях перевірки можна використовувати, якщо у вас є кілька шляхів для WebSocket
    // Наприклад, для ws://localhost:8080/my-websocket
    // if (request.url === '/my-websocket') {
    //   wss.handleUpgrade(request, socket, head, ws => {
    //     wss.emit('connection', ws, request);
    //   });
    // } else {
    //   socket.destroy(); // Закриваємо з'єднання, якщо URL не є WebSocket
    // }

    // Для простоти, обробляємо всі WebSocket upgrade запити
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request)
    })
})

// 4. Запускаємо HTTP сервер на певному порту
const PORT = 8080
server.listen(PORT, () => {
    console.log(`HTTP and WebSocket server running on http://localhost:${PORT}`)
})
