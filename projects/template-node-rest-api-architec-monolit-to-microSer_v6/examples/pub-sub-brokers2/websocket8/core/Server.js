import { WebSocketServer } from 'ws'
import { Socket } from './Socket.js'
import { Namespace } from './Namespace.js'
import crypto from 'crypto'

/**
 * @typedef {Object} ServerOptions
 * @property {Object} stateAdapter - Адаптер стану.
 * @property {Object} brokerAdapter - Адаптер брокера.
 * @property {Object} logger - Екземпляр логера.
 */

/**
 * Головний клас сервера (IO Server).
 * Відповідає за ініціалізацію WS, керування неймспейсами та глобальний Heartbeat.
 */
export class MyIoServer {
    /**
     * @param {number} port - Порт для прослуховування.
     * @param {ServerOptions} options
     */
    constructor(port, { stateAdapter, brokerAdapter, logger }) {
        this.serverId = crypto.randomUUID()
        this.logger = logger.child
            ? logger.child({ service: 'IoServer', serverId: this.serverId })
            : logger

        this.wss = new WebSocketServer({ port })

        /** @private */
        this._deps = {
            state: stateAdapter,
            broker: brokerAdapter,
            logger: this.logger,
            serverId: this.serverId,
        }

        /** @type {Map<string, Namespace>} */
        this.namespaces = new Map()

        this._heartbeatTimer = null

        this._init()
        this._startGlobalHeartbeat()
    }

    /**
     * Ініціалізація WS сервера та обробка нових підключень.
     * @private
     */
    _init() {
        this.wss.on('connection', async (ws, req) => {
            const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
            const nsName = url.pathname || '/'
            const ns = this.of(nsName)

            // Створюємо екземпляр сокета
            const socket = new Socket(ws, ns, this.logger)

            try {
                // Формуємо handshake дані
                socket.handshake = {
                    url: req.url,
                    headers: req.headers,
                    query: Object.fromEntries(url.searchParams),
                    address: req.socket.remoteAddress,
                    issued: Date.now(),
                }

                // Виконуємо мідлвари неймспейсу (автентифікація, валідація)
                await ns._runMiddlewares(socket)

                // Реєструємо сокет у неймспейсі ПІСЛЯ успішних мідлварів
                ns.addSocket(socket)

                // Повідомляємо про успішне підключення
                await ns.emit('connection', socket)

                ws.on('close', () => {
                    this.logger.debug(`Client disconnected from ${nsName}`)
                    ns._removeSocket(socket)
                })

                ws.on('error', (err) => {
                    this.logger.error(`Socket error [${socket.id}]:`, err)
                })
            } catch (err) {
                this.logger.warn(`Connection rejected: ${err.message}`)
                socket.rawSend({ event: 'error', payload: err.message })
                ws.terminate()
            }
        })

        this.wss.on('error', (err) => this.logger.error('WSS Global Error:', err))
        this.logger.info(`IO Server started on port ${this.wss.options.port}`)
    }

    /**
     * Отримує або створює неймспейс.
     * @param {string} name - Назва неймспейсу (напр. "/chat").
     * @returns {Namespace}
     */
    of(name) {
        if (!this.namespaces.has(name)) {
            this.namespaces.set(name, new Namespace(name, this._deps))
            this.logger.info(`Namespace created: ${name}`)
        }
        return this.namespaces.get(name)
    }

    /**
     * Розсилка на всі неймспейси сервера.
     * @param {string} event
     * @param {any} payload
     */
    async broadcast(event, payload) {
        const tasks = Array.from(this.namespaces.values()).map((ns) => ns.broadcast(event, payload))
        await Promise.allSettled(tasks)
    }

    /**
     * Глобальний цикл перевірки активності сокетів (Zombies detection).
     * @private
     */
    _startGlobalHeartbeat() {
        this._heartbeatTimer = setInterval(() => {
            for (const ns of this.namespaces.values()) {
                for (const socket of ns.localSockets.values()) {
                    if (!socket.isAlive) {
                        socket.logger.info('Terminating inactive socket')
                        socket.rawSocket.terminate()
                        continue
                    }

                    socket.isAlive = false

                    // Використовуємо системний ping для нативності
                    if (socket.rawSocket.readyState === socket.rawSocket.OPEN) {
                        // 1 = OPEN
                        socket.rawSocket.ping()
                        // Додатковий прикладний ping для клієнтів (JS SDK)
                        socket.rawSend({ event: 'ping' })
                    }
                }
            }
        }, 30000)

        // Не блокуємо завершення процесу таймером
        this._heartbeatTimer.unref()
    }

    /**
     * Коректне завершення роботи сервера.
     */
    async close() {
        this.logger.info('Shutting down IO server...')

        // 1. Зупиняємо таймер хартбіту
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer)
        }

        // 2. Закриваємо всі активні сокети примусово
        // Без цього wss.close() чекатиме вічно, поки клієнти самі не підуть
        const closePromises = []
        for (const ns of this.namespaces.values()) {
            for (const socket of ns.localSockets.values()) {
                // Додаємо проміс закриття для кожного сокета (опціонально)
                socket.rawSocket.terminate() // Жорстке розривання TCP-з'єднання
            }
            ns.clear() // Очищуємо підписки PubSub неймспейсу
        }

        // // 3. Закриваємо адаптер брокера (важливо для Redis, щоб закрити з'єднання)
        // if (this._deps.broker && typeof this._deps.broker.unsubscribe === 'function') {
        //     try {
        //         // Якщо є можливість відключити клієнтів Redis
        //         await this._deps.broker.pub.close()
        //         await this._deps.broker.sub.close()
        //     } catch (e) {
        //         this.logger.error('Error closing broker connections:', e)
        //     }
        // }

        // 4. Тепер викликаємо закриття самого сервера
        return new Promise((resolve, reject) => {
            // Встановлюємо таймаут на випадок, якщо сервер все одно "зависне"
            const forceExitTimeout = setTimeout(() => {
                this.logger.warn('Server close timeout, forcing resolve')
                resolve()
            }, 5000)

            this.wss.close((err) => {
                clearTimeout(forceExitTimeout)
                if (err) {
                    this.logger.error('WSS close error:', err)
                    return reject(err)
                }
                this.logger.info('IO server closed successfully')
                resolve()
            })
        })
    }
}
