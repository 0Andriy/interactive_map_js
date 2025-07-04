import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { createClient } from 'redis'

// ===============================================
// 1. Налаштування HTTP/WebSocket Сервера
// ===============================================
const httpServer = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<h1>WebSocket Server with Custom Namespaces</h1><p>Connect to /chat or /admin.</p>')
})

const wss = new WebSocketServer({ server: httpServer, clientTracking: false }) // clientTracking: false, бо ми управляємо клієнтами вручну

// ===============================================
// 2. Налаштування Redis для Pub/Sub
// ===============================================
const redisPubClient = createClient({ url: 'redis://localhost:6379' })
const redisSubClient = redisPubClient.duplicate()

redisPubClient.on('error', (err) => console.error('Redis Publisher Error:', err))
redisSubClient.on('error', (err) => console.error('Redis Subscriber Error:', err))

await Promise.all([redisPubClient.connect(), redisSubClient.connect()])
console.log('Connected to Redis')

// ===============================================
// 3. Клас для "Менеджера Namespaces"
// ===============================================
class NamespaceManager {
    constructor(name, redisPub, redisSub) {
        this.name = name // Наприклад, '/chat' або '/admin'
        this.redisPub = redisPub
        this.redisSub = redisSub
        this.clients = new Map() // socket.id -> WebSocket
        this.rooms = new Map() // room_id -> Set<socket.id> (для кімнат всередині цього namespace)
        this.channel = `ws_namespace:${name.substring(1)}` // Redis канал для цього namespace (без слеша)

        this.redisSub.subscribe(this.channel, (message) => {
            try {
                const data = JSON.parse(message)
                this.broadcast(data, data.excludeSocketId) // Розсилка клієнтам в цьому namespace
            } catch (error) {
                console.error(`Error processing Redis message for ${this.name}:`, error)
            }
        })

        console.log(`NamespaceManager for ${this.name} initialized. Redis channel: ${this.channel}`)
    }

    // Методи для керування клієнтами та кімнатами
    addClient(ws, userId, username) {
        ws.id =
            Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15)
        ws.userId = userId
        ws.username = username
        ws.namespace = this.name // Додаємо посилання на namespace
        this.clients.set(ws.id, ws)
        console.log(`[${this.name}] Client ${username} (${ws.id}) connected.`)
        ws.send(
            JSON.stringify({
                type: 'system',
                namespace: this.name,
                message: `Welcome to ${this.name}, ${username}!`,
            }),
        )
    }

    removeClient(wsId) {
        const ws = this.clients.get(wsId)
        if (ws) {
            console.log(`[${this.name}] Client ${ws.username} (${wsId}) disconnected.`)
            this.clients.delete(wsId)
            // Видаляємо з кімнат цього namespace
            for (const roomSockets of this.rooms.values()) {
                roomSockets.delete(wsId)
            }
        }
    }

    joinRoom(wsId, roomId) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Set())
        }
        this.rooms.get(roomId).add(wsId)
        console.log(`[${this.name}] Client ${wsId} joined room ${roomId}`)
    }

    leaveRoom(wsId, roomId) {
        if (this.rooms.has(roomId)) {
            this.rooms.get(roomId).delete(wsId)
            if (this.rooms.get(roomId).size === 0) {
                this.rooms.delete(roomId) // Видалити пусту кімнату
            }
            console.log(`[${this.name}] Client ${wsId} left room ${roomId}`)
        }
    }

    // Відправка повідомлення до всіх у цьому namespace (або до кімнати)
    broadcast(data, excludeSocketId = null) {
        const message = JSON.stringify(data)
        if (data.roomId) {
            // Якщо повідомлення призначено для конкретної кімнати
            if (this.rooms.has(data.roomId)) {
                const targetSockets = this.rooms.get(data.roomId)
                for (const socketId of targetSockets) {
                    if (socketId !== excludeSocketId) {
                        const ws = this.clients.get(socketId)
                        if (ws && ws.readyState === ws.OPEN) {
                            ws.send(message)
                        }
                    }
                }
            }
        } else {
            // Якщо повідомлення для всього namespace
            for (const ws of this.clients.values()) {
                if (ws.id !== excludeSocketId && ws.readyState === ws.OPEN) {
                    ws.send(message)
                }
            }
        }
    }

    // Публікація повідомлення в Redis для міжсерверної комунікації в цьому namespace
    publishToNamespace(data, excludeSocketId = null) {
        // Додаємо socketId, який потрібно виключити з розсилки на інших інстансах,
        // якщо це повідомлення від цього ж сокета
        data.excludeSocketId = excludeSocketId
        this.redisPub.publish(this.channel, JSON.stringify(data))
    }
}

// ===============================================
// 4. Ініціалізація менеджерів для кожного namespace
// ===============================================
const chatNamespace = new NamespaceManager('/chat', redisPubClient, redisSubClient)
const adminNamespace = new NamespaceManager('/admin', redisPubClient, redisSubClient)
// Додамо заглушку для загального namespace (якщо клієнт підключається до кореня)
const defaultNamespace = new NamespaceManager('/', redisPubClient, redisSubClient)

// ===============================================
// 5. Диспетчер WebSocket-з'єднань
// ===============================================
wss.on('connection', async (ws, req) => {
    // 1. Парсимо шлях з'єднання
    const url = new URL(req.url, `http://${req.headers.host}`)
    const path = url.pathname

    let targetNamespace
    if (path.startsWith('/chat')) {
        targetNamespace = chatNamespace
    } else if (path.startsWith('/admin')) {
        targetNamespace = adminNamespace
    } else {
        targetNamespace = defaultNamespace // fallback для кореневого шляху
    }

    // 2. Автентифікація для конкретного namespace (приклад)
    let userId = `user_${Math.random().toString(36).substring(2, 7)}`
    let username = `Guest_${Math.random().toString(36).substring(2, 7)}`

    if (targetNamespace.name === '/admin') {
        const token = url.searchParams.get('token')
        if (token !== 'SUPER_SECRET_ADMIN_TOKEN') {
            // Проста перевірка
            ws.send(
                JSON.stringify({
                    type: 'error',
                    namespace: '/admin',
                    message: 'Authentication failed for admin namespace.',
                }),
            )
            return ws.close(1008, 'Unauthorized') // Код статусу для політики порушення
        }
        userId = `admin_${Math.random().toString(36).substring(2, 7)}`
        username = `Admin_${Math.random().toString(36).substring(2, 7)}`
    }

    // Додаємо клієнта до відповідного менеджера namespace
    targetNamespace.addClient(ws, userId, username)

    // ===============================================
    // 6. Обробка подій для КОЖНОГО сокета
    // ===============================================
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString())
            console.log(`[${targetNamespace.name}] Received from ${ws.username}:`, data)

            // Логіка обробки повідомлень, специфічна для цього namespace
            if (targetNamespace.name === '/chat') {
                switch (data.type) {
                    case 'join_room': // Для чату, це аналог кімнат
                        const { roomId: chatRoomId } = data.payload
                        chatNamespace.joinRoom(ws.id, chatRoomId)
                        chatNamespace.publishToNamespace(
                            {
                                type: 'user_joined_room',
                                roomId: chatRoomId,
                                payload: {
                                    userId: ws.userId,
                                    username: ws.username,
                                    socketId: ws.id,
                                },
                            },
                            ws.id,
                        ) // Виключити відправника
                        break
                    case 'chat_message':
                        const { roomId: msgRoomId, text } = data.payload
                        if (
                            !chatNamespace.rooms.has(msgRoomId) ||
                            !chatNamespace.rooms.get(msgRoomId).has(ws.id)
                        ) {
                            return ws.send(
                                JSON.stringify({ type: 'error', message: 'Not in this room.' }),
                            )
                        }
                        const chatMessage = {
                            senderId: ws.userId,
                            senderName: ws.username,
                            text,
                            timestamp: new Date().toISOString(),
                        }
                        // Зберегти в БД (зверніться до Chat Persistence Service)
                        // publishToNamespace надішле всім, хто підписаний на цей namespace,
                        // а потім broadcast() в менеджері розсиле лише по кімнаті
                        chatNamespace.publishToNamespace({
                            type: 'chat_message',
                            roomId: msgRoomId,
                            payload: chatMessage,
                        })
                        break
                    default:
                        ws.send(
                            JSON.stringify({
                                type: 'error',
                                message: 'Unknown chat message type.',
                            }),
                        )
                }
            } else if (targetNamespace.name === '/admin') {
                switch (data.type) {
                    case 'send_alert':
                        const { alertMessage } = data.payload
                        console.log(`Admin ${ws.username} sent alert: ${alertMessage}`)
                        // Розсилаємо сповіщення в інший namespace (наприклад, у чат)
                        chatNamespace.publishToNamespace({
                            type: 'system_alert',
                            roomId: 'general', // Якщо у вас є загальна кімната
                            payload: { message: alertMessage, sender: ws.username },
                        })
                        ws.send(JSON.stringify({ type: 'system', message: 'Alert sent!' }))
                        break
                    default:
                        ws.send(
                            JSON.stringify({
                                type: 'error',
                                message: 'Unknown admin message type.',
                            }),
                        )
                }
            }
            // ... інші namespace ...
        } catch (error) {
            console.error(`Error processing message from ${ws.id}:`, error)
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format.' }))
        }
    })

    ws.on('close', () => {
        targetNamespace.removeClient(ws.id)
        // Додаткова логіка: оновлення статусу присутності
    })

    ws.on('error', (err) => {
        console.error(`[${targetNamespace.name}] WebSocket error for ${ws.id}:`, err)
    })
})

// Запускаємо сервер
const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => {
    console.log(`WebSocket server running on port ${PORT}`)
    console.log(`ws://localhost:${PORT}`)
})

// Заглушки для БД та інших сервісів
async function saveMessageToDb(message) {
    /* ... */ console.log('Saving message:', message)
}
async function checkUserAccessToChat(userId, chatId) {
    /* ... */ return true
}
