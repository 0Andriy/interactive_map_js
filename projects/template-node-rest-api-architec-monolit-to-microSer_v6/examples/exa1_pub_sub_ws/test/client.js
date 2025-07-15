// client.js
import WebSocket from 'ws'

const ws = new WebSocket('ws://localhost:8080')

ws.onopen = () => {
    console.log('Connected to WebSocket server')
    // Відправляємо повідомлення після встановлення з'єднання
    ws.send('Hello from client!')
}

ws.onmessage = (event) => {
    console.log(`Received message from server: ${event.data}`)
}

ws.onclose = () => {
    console.log('Disconnected from WebSocket server')
}

ws.onerror = (error) => {
    console.error('WebSocket error:', error)
}

// Приклад: надсилаємо повідомлення кожні 3 секунди
let counter = 0
setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
        counter++
        ws.send(`Client message ${counter}`)
    }
}, 3000)
