import http from 'http'
import { WebSocketServer } from 'ws'
import { URL } from 'url'
import { logger } from './logger.js'
import NamespaceManager from './namespaceManager.js'
import RoomsManager from './roomsManager.js'
import { setupHeartbeat } from './heartbeatModule.js'

// Імпорт обробників неймспейсів
import {
    gameNamespaceHandler,
    chatNamespaceHandler,
    defaultNamespaceHandler,
} from './namespaceManager.js' // Зверніть увагу, що обробники експортуються з namespaceManager.js

const PORT = process.env.PORT || 8080

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('WebSocket server is running. Please connect via WebSocket client.\n')
})

const wssInstance = new WebSocketServer({ noServer: true })

// Створюємо екземпляр RoomsManager
const roomsManager = new RoomsManager({ logger: logger })

// Передаємо roomsManager до NamespaceManager
const namespaceManager = new NamespaceManager(logger, roomsManager)

// Реєстрація неймспейсів
// Порядок важливий: більш специфічні шляхи мають бути першими!
namespaceManager.registerNamespace('/game/:id/chat', chatNamespaceHandler(namespaceManager), 'chat')
namespaceManager.registerNamespace('/game/:id', gameNamespaceHandler(namespaceManager), 'game')
namespaceManager.registerNamespace('/', defaultNamespaceHandler(namespaceManager), 'default')

server.on('upgrade', async (req, socket, head) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`)
    const pathname = requestUrl.pathname
    const queryParams = requestUrl.searchParams

    logger.info(`Incoming WebSocket upgrade request for: ${pathname}`)

    // --- Логіка Аутентифікації та Авторизації (Приклад) ---
    // У реальному застосунку тут буде перевірка JWT токенів або сесій
    let userData = {
        userId: 'user-' + Math.random().toString(36).substring(2, 8),
        username: 'AnonUser' + Math.floor(Math.random() * 1000),
    }
    const authHeader = req.headers.authorization

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        try {
            // У реальному застосунку: const decoded = jwt.verify(token, process.env.JWT_SECRET);
            // Для прикладу просто імітуємо парсинг
            const base64Payload = token.split('.')[1]
            const decodedPayload = JSON.parse(Buffer.from(base64Payload, 'base64').toString())
            userData = {
                userId: decodedPayload.sub || decodedPayload.userId || userData.userId, // 'sub' або 'userId'
                username: decodedPayload.username || decodedPayload.name || userData.username, // 'username' або 'name'
            }
            logger.debug(
                `JWT authentication successful for ${userData.username} (${userData.userId}).`,
            )
        } catch (error) {
            logger.warn(`JWT authentication failed: ${error.message}. Closing connection.`)
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
            socket.destroy()
            return
        }
    } else if (queryParams.has('token')) {
        // Проста імітація токена з параметрів запиту для тестування
        const token = queryParams.get('token')
        try {
            const base64Payload = token.split('.')[1]
            const decodedPayload = JSON.parse(Buffer.from(base64Payload, 'base64').toString())
            userData = {
                userId: decodedPayload.sub || decodedPayload.userId || userData.userId,
                username: decodedPayload.username || decodedPayload.name || userData.username,
            }
            logger.debug(
                `Query param token authentication successful for ${userData.username} (${userData.userId}).`,
            )
        } catch (error) {
            logger.warn(
                `Query param token authentication failed: ${error.message}. Closing connection.`,
            )
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
            socket.destroy()
            return
        }
    } else {
        logger.debug(`No authentication token provided. Using default user data.`)
    }

    wssInstance.handleUpgrade(req, socket, head, async (ws) => {
        // Розширюємо об'єкт `ws`
        ws.id = Date.now().toString() + Math.random().toString(36).substring(2, 8) // Унікальний ID конекту
        ws.userId = userData.userId // ID користувача (може мати кілька конектів)
        ws.username = userData.username // Ім'я користувача для логування
        ws.path = pathname // Шлях, за яким клієнт підключився
        ws.isAlive = true // Для Heartbeat

        ws.on('pong', () => {
            ws.isAlive = true
            logger.debug(`[Ping/Pong] Received pong from ${ws.username} (${ws.id}).`)
        })

        // Делегуємо обробку підключення NamespaceManager
        const handled = namespaceManager.handleConnection(ws)
        if (!handled) {
            // Якщо NamespaceManager не знайшов відповідний неймспейс або виникла помилка,
            // він вже закрив сокет і вивів лог.
            return
        }

        wssInstance.emit('connection', ws, req) // Може бути корисно для загальних лістерів
    })
})

// Налаштовуємо Heartbeat для всіх клієнтів через wssInstance
setupHeartbeat(wssInstance, {}, logger)

server.listen(PORT, () => {
    logger.info(`Server started on port ${PORT}`)
    logger.info(`WebSocket services initialized with automated namespace routing.`)
    logger.info(`Test paths: /game/my-game-id, /game/my-game-id/chat, /`)
})
