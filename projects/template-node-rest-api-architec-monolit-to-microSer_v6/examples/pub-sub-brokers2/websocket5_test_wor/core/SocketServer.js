import { WebSocketServer } from 'ws'
import crypto from 'crypto'
import { Connection } from './Connection.js'

/**
 * SocketServer: Центральний вузол керування WebSocket-сервером.
 * Відповідає за маршрутизацію неймспейсів, моніторинг активності (Heartbeat)
 * та глобальну синхронізацію через брокер.
 */
export class SocketServer {
    /**
     * @param {Object} params - Параметри ініціалізації.
     * @param {import('http').Server} params.server - HTTP сервер для прив'язки WS.
     * @param {string} [params.basePath] - Базовий шлях (напр. '/ws').
     * @param {import('../interfaces/IStateAdapter').IStateAdapter} params.state - Адаптер стану.
     * @param {import('../interfaces/IBrokerAdapter').IBrokerAdapter} params.broker - Адаптер брокера.
     * @param {import('../interfaces/ILogger').ILogger} params.logger - Логер.
     */
    constructor({ server, basePath = '', state, broker, logger }) {
        /** @type {WebSocketServer} */
        this.wss = new WebSocketServer({ server })

        /** @type {string} */
        this.basePath = basePath.replace(/\/$/, '')

        /** @type {import('../interfaces/IStateAdapter').IStateAdapter} */
        this.state = state

        /** @type {import('../interfaces/IBrokerAdapter').IBrokerAdapter} */
        this.broker = broker

        /** @type {import('../interfaces/ILogger').ILogger} */
        this.logger = logger

        /** @type {Map<string, import('./Namespace').Namespace>} */
        this.namespaces = new Map()

        /** @type {string} */
        this.globalTopic = 'broker_wss_global'

        /** @private */
        this._heartbeatInterval = null

        this._initHeartbeat()
        this._initGlobalSubscription()
    }

    /**
     * Ініціалізує механізм перевірки активності з'єднань (Liveness).
     * @private
     */
    _initHeartbeat() {
        this._heartbeatInterval = setInterval(() => {
            this.namespaces.forEach((ns) => {
                ns.connections.forEach((conn) => {
                    if (conn.meta.isAlive === false) {
                        this.logger?.info(`[WSS] Термінація неактивного з'єднання: ${conn.id}`)
                        return conn.ws.terminate()
                    }

                    // Скидаємо прапор і надсилаємо Ping
                    conn.meta.isAlive = false
                    if (conn.ws.readyState === conn.ws.OPEN) {
                        conn.ws.ping()
                    }
                })
            })
        }, 30000) // 30 секунд - стандарт для балансувальників (напр. AWS/NGINX)
    }

    /**
     * Реєструє новий неймспейс у системі.
     * @param {import('./Namespace').Namespace} nsInstance
     */
    registerNamespace(nsInstance) {
        this.namespaces.set(nsInstance.name, nsInstance)
        this.logger?.debug(`[WSS] Неймспейс ${nsInstance.name} зареєстровано.`)
    }

    /**
     * Основний метод запуску сервера та обробки підключень.
     */
    init() {
        this.wss.on('connection', async (ws, req) => {
            const ip = req.socket.remoteAddress
            const host = req.headers.host || 'localhost'

            // Визначаємо протокол (враховуючи проксі-сервери)
            const isSecure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted
            const protocol = isSecure ? 'wss' : 'ws'

            // Надійний парсинг URL
            const fullUrl = new URL(req.url, `${protocol}://${host}`)
            const fullPath = fullUrl.pathname

            // Визначаємо шлях неймспейсу
            const nsPath = fullPath.startsWith(this.basePath)
                ? fullPath.substring(this.basePath.length)
                : fullPath

            const ns = this.namespaces.get(nsPath)

            if (!ns) {
                this.logger?.error(
                    `[WSS] Відхилено: Неймспейс ${nsPath} не знайдено (URL: ${fullPath})`,
                )
                return ws.close(1008, 'NS_NOT_FOUND')
            }

            try {
                // Аутентифікація на рівні неймспейсу
                const user = await ns.authenticate(req)

                // Створення обгортки Connection
                const conn = new Connection(ws, ns, user, this.logger, ip)

                // Додаємо в реєстр неймспейсу
                ns.connections.set(conn.id, conn)

                // Відправляємо Welcome-пакет
                // Senior-порада: Формуйте об'єкт так, щоб фронтенд міг однозначно зрозуміти стан
                const welcomeEnvelope = {
                    id: crypto.randomUUID(),
                    ns: ns.name,
                    room: null,
                    type: 'SYSTEM_CONNECTED',
                    timestamp: Date.now(),
                    payload: {
                        message: 'Connection established successfully',
                        sid: conn.id, // Корисно для дебагу на клієнті
                        user: user ? { id: user.id, name: user.name } : null,
                    },
                    sender: null,
                    meta: {
                        version: '1.0.0', // Версія вашого протоколу
                    },
                }

                // Використовуємо метод send нашого класу Connection
                conn.send(welcomeEnvelope)

                this.logger?.info(
                    `[WSS] Сокет ${conn.id} підключено до ${nsPath} (User: ${user?.id || 'Guest'})`,
                )
            } catch (err) {
                this.logger?.error(`[WSS] Помилка авторизації в ${nsPath}: ${err.message}`)
                ws.close(4001, 'AUTH_FAILED')
            }
        })
    }

    /**
     * Підписка на повідомлення, що призначені абсолютно всім клієнтам у кластері.
     * @private
     * @returns {Promise<void>}
     */
    async _initGlobalSubscription() {
        try {
            await this.broker.subscribe(this.globalTopic, (packet) => {
                // Розсилаємо локально у кожен неймспейс
                this.namespaces.forEach((ns) => {
                    ns._localNamespaceEmit(packet.envelope)
                })
            })
        } catch (error) {
            this.logger?.error(`[WSS] Помилка глобальної підписки брокера: ${error.message}`)
        }
    }

    /**
     * Надсилає повідомлення абсолютно ВСІМ підключеним клієнтам системи (увесь кластер).
     * @param {string} type - Тип події.
     * @param {Object} payload - Дані.
     */
    async broadcastAll(type, payload) {
        const envelope = {
            id: crypto.randomUUID(),
            type,
            ts: Date.now(),
            payload,
        }

        await this.broker.publish(this.globalTopic, { envelope })
    }

    /**
     * Коректна зупинка сервера та очищення ресурсів.
     */
    async shutdown() {
        if (this._heartbeatInterval) clearInterval(this._heartbeatInterval)

        this.logger?.info('[WSS] Зупинка WebSocket сервера...')

        const nsDestructions = Array.from(this.namespaces.values()).map((ns) => ns.destroy())
        await Promise.allSettled(nsDestructions)

        return new Promise((resolve) => {
            this.wss.close(() => {
                this.logger?.info("[WSS] Всі з'єднання закрито.")
                resolve()
            })
        })
    }
}
