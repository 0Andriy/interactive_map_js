// index.js
import MyWebSocketServer from './src/server/MyWebSocketServer.js'
import 'dotenv/config' // Завантажуємо змінні оточення

const wsPort = parseInt(process.env.WS_PORT || '8080', 10)
const myWsServer = new MyWebSocketServer({ port: wsPort })

// Можна додати обробку сигналів для коректного завершення роботи
process.on('SIGINT', () => {
    console.log('SIGINT signal received. Shutting down WebSocket server...')
    myWsServer.stop()
    process.exit(0)
})

process.on('SIGTERM', () => {
    console.log('SIGTERM signal received. Shutting down WebSocket server...')
    myWsServer.stop()
    process.exit(0)
})
