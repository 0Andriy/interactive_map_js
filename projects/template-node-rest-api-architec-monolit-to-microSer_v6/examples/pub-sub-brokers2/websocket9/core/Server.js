import { WebSocketServer } from 'ws'
import { Socket } from './Socket.js'
import { Namespace } from './Namespace.js'
import crypto from 'crypto'

/**
 * @typedef {Object} ServerOptions
 * @property {Object} stateAdapter - Адаптер для керування станом (Redis/Mongo).
 * @property {Object} brokerAdapter - Адаптер для міжсерверного зв'язку (Redis/NATS).
 * @property {Object} logger - Інстанс логера.
 * @property {string} [path='/'] - Базовий шлях (напр. /ws/v1), який буде ігноруватися при виборі NS.
 * @property {number} [port] - Порт (якщо не передано існуючий server).
 * @property {import('http').Server} [server] - Вже існуючий HTTP сервер.
 */

/**
 * WSServer - Головна точка входу.
 * Керує життєвим циклом неймспейсів, базовими шляхами та глобальним здоров'ям з'єднань.
 */
export class WSServer {
    /**
     * @param {ServerOptions} options
     */
    constructor(options) {
        /**
         * Унікальний ідентифікатор сервера.
         * @type {string}
         */
        this.serverId = crypto.randomUUID()

        /**
         * Базовий шлях для WS з'єднань.
         * @type {string}
         */
        this.basePath = options.path ? this._normalizePath(options.path) : '/'

        /**
         * Інстанс логера.
         * @type {import('../interfaces/Logger.js').Logger}
         */
        this.logger = options.logger.child
            ? options.logger.child({ service: 'WSServer', serverId: this.serverId })
            : options.logger

        /**
         * Залежності сервера.
         * @type {Object}
         */
        this._deps = {
            state: options.stateAdapter,
            broker: options.brokerAdapter,
            logger: this.logger,
            serverId: this.serverId,
        }

        /**
         * Колекція неймспейсів сервера.
         * @type {Map<string, Namespace>}
         */
        this.namespaces = new Map()

        // Ініціалізація WebSocket сервера
        const wssOptions = options.server
            ? { server: options.server }
            : { port: options.port || 8080 }

        /**
         * Інстанс WebSocket сервера.
         * @type {import('ws').WebSocketServer}
         */
        this.wss = new WebSocketServer({
            ...wssOptions,
        })

        /**
         * Таймер глобального хартбіту.
         * @type {NodeJS.Timeout|null}
         */
        this._heartbeatTimer = null

        /** Позначка закриття сервера.
         * @type {boolean}
         * @private
         */
        this._isClosing = false

        /**
         * Час створення сервера.
         * @type {number}
         */
        this.createdAt = Date.now()

        this._init()
        this._startGlobalHeartbeat()

        const mode = options.server ? 'attached to HTTP server' : `on port ${options.port}`
        this.logger?.info?.(`[${this.constructor.name}] WS Server started [${mode}]`, {
            basePath: this.basePath,
            createdAt: this.createdAt,
        })
    }

    /**
     * Час роботи сервера (uptime).
     * @returns {number}
     */
    get uptime() {
        return Date.now() - this.createdAt
    }

    /**
     * Підрахунок загальної кількості підключених клієнтів на всіх неймспейсах.
     * @returns {Promise<number>}
     */
    async getMemberCount() {
        let count = 0
        for (const ns of this.namespaces.values()) {
            count += await ns.getMemberCount()
        }
        return count
    }

    /**
     * Ініціалізація WS сервера та обробка нових підключень.
     * @private
     */
    _init() {
        this.wss.on('connection', async (ws, req) => {
            if (this._isClosing) {
                ws.terminate()
                return
            }

            try {
                const protocol = req.headers['x-forwarded-proto'] || 'http'
                const url = new URL(req.url, `${protocol}://${req.headers.host || 'localhost'}`)

                const nsName = this._extractNamespaceName(url.pathname)

                // Захист: якщо шлях не відповідає basePath, відхиляємо з'єднання
                if (!nsName) {
                    this.logger?.warn?.(
                        `[${this.constructor.name}] Connection rejected: Base path mismatch`,
                        {
                            received: url.pathname,
                            expected: this.basePath,
                        },
                    )
                    ws.terminate()
                    return
                }

                // Отримуємо або створюємо неймспейс
                const ns = this.of(nsName)

                // Створюємо новий сокет
                const socket = new Socket(ws, ns, this.logger)

                // Дані рукостискання
                socket.handshake = {
                    url: req.url,
                    headers: req.headers,
                    query: Object.fromEntries(url.searchParams),
                    address: req.socket.remoteAddress,
                    issued: Date.now(),
                    secure: protocol === 'https',
                }

                // Реєструємо сокет (це запустить мідлвари неймспейсу)
                await ns.addSocket(socket)

                // Подія підключення на рівні неймспейсу
                await ns.emit('connection', socket)

                // Обробка помилок сокета
                ws.on('error', (error) => {
                    this.logger?.error?.(`[${this.constructor.name}] Socket transport error`, {
                        socketId: socket.id,
                        error: error.message,
                    })
                })
            } catch (error) {
                this.logger?.error?.(`[${this.constructor.name}] Connection handling failed`, {
                    error: error.message,
                })
                ws.terminate()
            }
        })

        // Глобальна обробка помилок WSS
        this.wss.on('error', (error) => {
            this.logger?.error?.(`[${this.constructor.name}] WSS Global Error:`, error)
        })
    }

    /**
     * Вирізає basePath з URL, залишаючи назву неймспейсу.
     * @param {string} pathname
     * @returns {string|null}
     * @private
     */
    _extractNamespaceName(pathname) {
        const normalizedPath = this._normalizePath(pathname)

        // Якщо basePath - це '/', то весь шлях і є неймспейсом
        if (this.basePath === '/') return normalizedPath

        if (!normalizedPath.startsWith(this.basePath)) return null

        // Вирізаємо префікс
        let nsName = normalizedPath.substring(this.basePath.length)

        // Гарантуємо, що неймспейс починається з /
        if (!nsName.startsWith('/')) nsName = '/' + nsName

        return nsName
    }

    /**
     * Нормалізація шляхів (видалення зайвих слешів).
     * @private
     */
    _normalizePath(p) {
        return p.replace(/\/+$/, '') || '/'
    }

    /**
     * Отримує або створює неймспейс.
     * @param {string} name
     * @returns {Namespace}
     * @example
     * const chatNS = io.of('/chat');
     */
    of(name) {
        const normalizedName = name.startsWith('/') ? name : `/${name}`

        if (!this.namespaces.has(normalizedName)) {
            const ns = new Namespace(normalizedName, this._deps)
            this.namespaces.set(normalizedName, ns)
            this.logger?.info?.(`[${this.constructor.name}] Namespace created`, {
                ns: normalizedName,
            })
        }
        return this.namespaces.get(normalizedName)
    }

    /**
     * Розсилка на всі неймспейси сервера.
     * @param {string} event
     * @param {any} payload
     * @example
     * io.broadcast('announcement', { message: 'Server will restart soon.' });
     */
    async broadcast(event, payload) {
        const tasks = Array.from(this.namespaces.values()).map((ns) => {
            ns.broadcast(event, payload)
        })
        await Promise.allSettled(tasks)
    }

    /**
     * Глобальний цикл перевірки активності сокетів (Zombies detection).
     * @private
     */
    _startGlobalHeartbeat() {
        this._heartbeatTimer = setInterval(() => {
            for (const ns of this.namespaces.values()) {
                for (const socket of ns._localSockets.values()) {
                    if (!socket.isAlive) {
                        socket.logger?.info?.(
                            `[${socket.constructor.name}] Terminating inactive socket`,
                            {
                                nsName: ns.name,
                                socketId: socket.id,
                                uptime: socket.uptime,
                            },
                        )
                        socket.disconnect((4000, 'Heartbeat timeout'))
                        socket.rawSocket.terminate()
                        continue
                    }

                    // Позначаємо сокет як неактивний на час пінгу
                    socket.isAlive = false

                    // Перевіряємо, чи сокет ще відкритий
                    if (socket.rawSocket.readyState !== socket.rawSocket.OPEN) {
                        return
                    }

                    // Нативний пінг
                    socket.rawSocket.ping()

                    // Програмний пінг
                    socket.ping()
                }
            }
        }, 30000)

        // Не блокуємо завершення процесу таймером
        this._heartbeatTimer.unref()
    }

    /**
     * Коректне завершення роботи сервера.
     * @returns {Promise<void>}
     * @example
     * await io.close();
     */
    async close() {
        if (this._isClosing) return
        this._isClosing = true

        this.logger?.info?.(`[${this.constructor.name}] Shutting down IO server...`, {
            uptime: this.uptime,
        })

        // 1. Зупиняємо таймер глобального хартбіту
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer)
        }

        // 2. Знищуємо неймспейси (це відключить сокети та відпишеться від брокерів)
        const nsTasks = Array.from(this.namespaces.values()).map((ns) => {
            ns.destroy()
        })
        await Promise.allSettled(nsTasks)
        this.namespaces.clear()

        // 3. Закриваємо сам WSS
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.logger?.warn?.(`[${this.constructor.name}] WSS close timeout, forcing exit`)
                resolve()
            }, 5000)

            this.wss.close((err) => {
                clearTimeout(timer)
                if (err) {
                    this.logger?.error?.(`[${this.constructor.name}] WSS close error`, {
                        error: err.message,
                    })
                    return reject(err)
                }
                this.logger?.info?.(`[${this.constructor.name}] WS Server closed successfully`)
                resolve()
            })
        })
    }
}
