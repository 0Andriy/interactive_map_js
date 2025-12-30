import { WebSocketServer } from 'ws'
import { Connection } from './Connection.js'

/**
 * SocketServer: Керує WebSocket сервером та маршрутизацією неймспейсів.
 */
export class SocketServer {
    /**
     * @param {object} params
     * @param {import('http').Server} params.server
     * @param {string} [deps.basePath] - Наприклад '/ws'
     * @param {import('../interfaces/IStateAdapter').IStateAdapter} params.state
     * @param {import('../interfaces/IBrokerAdapter').IBrokerAdapter} params.broker
     * @param {import('../interfaces/ILogger').ILogger} params.logger
     */
    constructor({ server, basePath = '', state, broker, logger }) {
        this.wss = new WebSocketServer({ server })
        this.basePath = basePath.replace(/\/$/, '') // Видаляємо слеш в кінці
        this.state = state
        this.broker = broker
        this.logger = logger
        this.namespaces = new Map()
        this.globalTopic = 'server:global:broadcast'

        this._initHeartbeat()
        this._initGlobalSubscription()
    }

    _initHeartbeat() {
        setInterval(() => {
            this.namespaces.forEach((ns) => {
                ns.connections.forEach((conn) => {
                    if (conn.meta.isAlive === false) {
                        this.logger?.info(`Terminating inactive connection: ${conn.id}`)
                        return conn.ws.terminate()
                    }
                    conn.meta.isAlive = false
                    conn.ws.ping() // Надсилаємо Ping клієнту
                })
            })
        }, 30000) // Кожні 30 секунд
    }

    /**
     * @param {import('./Namespace').Namespace} nsInstance
     */
    registerNamespace(nsInstance) {
        this.namespaces.set(nsInstance.name, nsInstance)
    }

    init() {
        this.wss.on('connection', async (ws, req) => {
            // 1. Динамически определяем базу (протокол + хост)
            // 'x-forwarded-proto' используется, если сервер за прокси (Nginx/Cloudflare)
            const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws'
            const host = req.headers.host // Например: 'myapp.com' или 'localhost:3000'

            // 2. Создаем полный URL объект на основе реальных данных запроса
            const fullUrl = new URL(req.url, `${protocol}://${host}`)
            const fullPath = fullUrl.pathname

            // Динамічне відрізання префікса (напр. /ws/chat -> /chat)
            const nsPath = fullPath.startsWith(this.basePath)
                ? fullPath.substring(this.basePath.length)
                : fullPath

            const ns = this.namespaces.get(nsPath)
            const ip = req.socket.remoteAddress

            if (!ns) {
                this.logger?.error(
                    `Connection rejected: Namespace ${nsPath} not found (Full URL: ${fullUrl.href})`,
                )
                return ws.close(1008, 'NS_NOT_FOUND')
            }

            try {
                const user = await ns.authenticate(req)
                const conn = new Connection(ws, ns, user, this.logger, ip)
                ns.connections.set(conn.id, conn)
                this.logger?.info(`Socket ${conn.id} assigned to ${nsPath}`)
            } catch (err) {
                this.logger?.error(`Auth failed for ${nsPath}`, err)
                ws.close(4001, 'AUTH_FAILED')
            }
        })
    }

    /** Підписка на повідомлення для абсолютно всіх підключень кластера */
    async _initGlobalSubscription() {
        await this.broker.subscribe(this.globalTopic, (packet) => {
            this.namespaces.forEach((ns) => ns._localNamespaceEmit(packet.event, packet.data))
        })
    }

    /** Надіслати ВСІМ підключеним клієнтам у системі */
    async broadcastAll(event, data) {
        await this.broker.publish(this.globalTopic, { event, data })
    }
}
