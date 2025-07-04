// server.js
const WebSocket = require('ws')
const RoomsManager = require('./roomsManager') // Імпортуємо наш клас

const wss = new WebSocket.Server({ port: 8080 })
const roomsManager = new RoomsManager() // Створюємо екземпляр менеджера кімнат

wss.on('connection', (ws) => {
    roomsManager.addClient(ws) // Додаємо клієнта і генеруємо ID

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message)
            switch (data.type) {
                case 'joinRoom':
                    if (data.room) roomsManager.joinRoom(ws, data.room)
                    break
                case 'leaveRoom':
                    if (data.room) roomsManager.leaveRoom(ws, data.room)
                    break
                case 'chatMessage':
                    if (data.room && data.message) {
                        const broadcastMessage = JSON.stringify({
                            type: 'message',
                            sender: ws.id,
                            text: data.message,
                            room: data.room,
                        })
                        roomsManager.broadcastToRoom(data.room, broadcastMessage)
                    }
                    break
                default:
                    console.log(`Unknown message type: ${data.type}`)
            }
        } catch (error) {
            console.error('Failed to parse message or handle:', error)
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format.' }))
        }
    })

    ws.on('close', () => {
        roomsManager.removeClient(ws) // Видаляємо клієнта при відключенні
    })

    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${ws.id || 'N/A'}:`, error)
    })
})

console.log('WebSocket server started on port 8080')
