import { WebSocketServer } from 'ws'
import { Namespace } from './Namespace.js'
import { MemoryAdapter } from '../adapters/MemoryAdapter.js'

export class Server {
    // Впроваджуємо залежності через конструктор (DI)
    constructor(srv, opts = {}, dependencies = {}) {
        this.wss = null
        this.opts = {
            path: opts.path || '', // Можливість задати глобальний префікс на кшталт '/ws'
            cors: opts.cors || { origin: '*' },
            ...opts,
        }

        // Інєкція дефолтного класу адаптера
        this.AdapterClass = dependencies.AdapterClass || MemoryAdapter

        this.namespaces = [] // Масив для підтримки regex-пошуку
        this.plugins = []
        this.connectionMiddlewares = []

        // Створюємо дефолтний простір імен
        this.of('/')

        if (srv) this.attach(srv)
    }

    use(fn) {
        this.connectionMiddlewares.push(fn)
        return this
    }

    plugin(PluginClass, opts = {}) {
        this.plugins.push({ PluginClass, opts })
        return this
    }

    // Перевірка CORS перед ініціалізацією WebSocket з'єднання
    checkCors(req) {
        const origin = req.headers.origin
        const allowedOrigin = this.opts.cors.origin

        if (allowedOrigin === '*') return true
        if (Array.isArray(allowedOrigin) && allowedOrigin.includes(origin)) return true
        if (typeof allowedOrigin === 'function' && allowedOrigin(origin)) return true
        if (allowedOrigin === origin) return true

        return false
    }

    attach(srv, opts = {}) {
        if (this.wss) throw new Error('Server is already attached.')

        this.wss = new WebSocketServer({
            server: srv,
            // Використовуємо нативний верифікатор ws для CORS та валідації URL
            verifyClient: (info, callback) => {
                if (!this.checkCors(info.req)) {
                    return callback(false, 403, 'CORS Forbidden')
                }

                // Перевіряємо, чи є взагалі такий namespace в нашій системі
                const url = new URL(info.req.url, 'http://localhost')
                const matched = this.matchNamespace(url.pathname)

                if (!matched) {
                    return callback(false, 404, 'Namespace Not Found')
                }

                callback(true)
            },
            ...this.opts,
            ...opts,
        })

        this.init()
    }

    // Пошук відповідного namespace (підтримка рядків та регулярних виразів)
    matchNamespace(pathname) {
        // Вирізаємо глобальний префікс, якщо він є в опціях
        let targetPath = pathname
        if (this.opts.path && pathname.startsWith(this.opts.path)) {
            targetPath = pathname.substring(this.opts.path.length) || '/'
        }

        return this.namespaces.find((nsp) => {
            if (nsp.name instanceof RegExp) {
                return nsp.name.test(targetPath)
            }
            return nsp.name === targetPath
        })
    }

    init() {
        this.wss.on('connection', async (ws, req) => {
            const url = new URL(req.url, 'http://localhost')
            const matchedNsp = this.matchNamespace(url.pathname)

            // Розширений Handshake об'єкт
            const handshake = {
                id: crypto.randomUUID(),
                url: req.url,
                pathname: url.pathname,
                headers: req.headers,
                cookies: this.parseCookies(req.headers.cookie),
                address: req.socket.remoteAddress,
                referer: req.headers.referer || '',
                issued: Date.now(),
                query: Object.fromEntries(url.searchParams),
                user: null,
            }

            let index = 0
            const next = async (err) => {
                if (err) {
                    ws.close(4401, err.message || 'Unauthorized')
                    return
                }

                const middleware = this.connectionMiddlewares[index++]
                if (middleware) {
                    try {
                        await middleware({ handshake, req }, next)
                    } catch (e) {
                        next(e)
                    }
                } else {
                    matchedNsp.handleConnection(ws, handshake)
                }
            }

            await next()
        })
    }

    parseCookies(cookieHeader) {
        if (!cookieHeader) return {}
        return Object.fromEntries(cookieHeader.split(';').map((c) => c.trim().split('=')))
    }

    // Створення простору імен (рядок, префікс або регулярка)
    of(name) {
        const existing = this.namespaces.find((nsp) => nsp.name.toString() === name.toString())
        if (existing) return existing

        // Передаємо сервіс адаптера через конструктор (DI)
        const nsp = new Namespace(name, this, this.AdapterClass)
        this.namespaces.push(nsp)
        return nsp
    }

    // Метод швидкої відправки користувачу на всі його девайси (Multi-device)
    toUser(userId) {
        return this.of('/').to(`user:${userId}`)
    }

    on(event, callback) {
        this.of('/').on(event, callback)
    }
    to(room) {
        return this.of('/').to(room)
    }
    emit(event, ...args) {
        this.of('/').emit(event, ...args)
    }
}
