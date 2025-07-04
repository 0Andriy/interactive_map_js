import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import RedisClient from './classes/RedisClient.js'
import ChatNamespace from './classes/ChatNamespace.js'
import AdminNamespace from './classes/AdminNamespace.js'
import Namespace from './classes/Namespace.js' // Для базового namespace, якщо потрібен

/**
 * Головний клас для керування WebSocket-сервером та просторами імен.
 */
class WebSocketServerManager {
    constructor(port, redisUrl) {
        this.port = port
        this.redisClient = new RedisClient(redisUrl)
        this.httpServer = createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(
                '<h1>WebSocket Server with OOP Namespaces</h1><p>Connect to /chat or /admin.</p>',
            )
        })
        this.wss = new WebSocketServer({ server: this.httpServer, clientTracking: false }) // Вимикаємо clientTracking

        this.namespaces = new Map() // path -> Namespace instance

        this._initNamespaces()
        this._setupConnectionHandler()
    }

    async start() {
        try {
            await this.redisClient.connect()
            this.httpServer.listen(this.port, () => {
                console.log(`WebSocket server running on port ${this.port}`)
                console.log(`ws://localhost:${this.port}`)
            })
        } catch (error) {
            console.error('Failed to start server:', error)
            process.exit(1)
        }
    }

    _initNamespaces() {
        // Ініціалізуємо ChatNamespace. Можливо, ChatNamespace потрібен доступ до інших сервісів (DB, Auth).
        const chatNsp = new ChatNamespace(this.redisClient)
        this.namespaces.set('/chat', chatNsp)

        // Ініціалізуємо AdminNamespace, передаючи йому посилання на ChatNamespace для взаємодії
        const adminNsp = new AdminNamespace(this.redisClient, chatNsp)
        this.namespaces.set('/admin', adminNsp)

        // Додаємо базовий namespace для кореневого шляху, якщо потрібно
        const defaultNsp = new Namespace('/', this.redisClient)
        this.namespaces.set('/', defaultNsp)

        // Передаємо посилання на менеджери один одному, якщо потрібна крос-неймспейс комунікація
        // (вже зроблено для AdminNamespace)
    }

    _setupConnectionHandler() {
        this.wss.on('connection', async (ws, req) => {
            const url = new URL(req.url, `http://${req.headers.host}`)
            const path = url.pathname

            let targetNamespace = this.namespaces.get(path)
            if (!targetNamespace) {
                targetNamespace = this.namespaces.get('/') // Fallback до дефолтного
                if (!targetNamespace) {
                    console.warn(`No namespace found for path ${path}. Closing connection.`)
                    ws.send(JSON.stringify({ type: 'error', message: 'No handler for this path.' }))
                    return ws.close(1000, 'No handler')
                }
            }

            let user = null
            if (targetNamespace instanceof AdminNamespace) {
                user = await targetNamespace.authenticate(req)
            } else {
                // Загальна логіка автентифікації для інших namespace
                // const token = url.searchParams.get('token');
                // user = await AuthManager.verifyToken(token); // Централізована автентифікація
                user = {
                    userId: `user_${ws.id.substring(0, 5)}`,
                    username: `Guest_${ws.id.substring(0, 5)}`,
                } // Заглушка
            }

            if (!user) {
                ws.send(JSON.stringify({ type: 'error', message: 'Authentication failed.' }))
                return ws.close(1008, 'Unauthorized')
            }

            targetNamespace.addClient(ws, user.userId, user.username)
        })
    }
}

// Запускаємо сервер
const server = new WebSocketServerManager(3000, 'redis://localhost:6379')
server.start()
