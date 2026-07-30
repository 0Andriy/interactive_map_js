import { WebSocketServer } from 'ws'
import { Namespace } from './Namespace.js'

export class Server {
    constructor(srv, opts = {}) {
        this.wss = null
        this.opts = opts
        this.namespaces = new Map()
        this.plugins = [] // Глобальні плагіни (Extensions)
        this.connectionMiddlewares = [] // Цепочка для авторизації підключень

        this.namespaces.set('/', new Namespace('/', this))

        if (srv) this.attach(srv)
    }

    // Реєстрація глобального middleware для авторизації / перевірки URL
    use(fn) {
        this.connectionMiddlewares.push(fn)
        return this
    }

    // Реєстрація глобального плагіна (наприклад Heartbeat, AckManager)
    plugin(PluginClass, opts = {}) {
        this.plugins.push({ PluginClass, opts })
        return this
    }

    attach(srv, opts = {}) {
        if (this.wss) throw new Error('Server is already attached.')
        this.wss = new WebSocketServer({ server: srv, ...this.opts, ...opts })
        this.init()
    }

    init() {
        this.wss.on('connection', async (ws, req) => {
            const url = new URL(req.url, 'http://localhost')
            const nspName = url.pathname === '/' ? '/' : url.pathname

            if (!this.namespaces.has(nspName)) {
                ws.close(4404, 'Namespace Not Found')
                return
            }

            // Формуємо об'єкт handshake
            const handshake = {
                url: req.url,
                headers: req.headers,
                address: req.socket.remoteAddress,
                issued: Date.now(),
                query: Object.fromEntries(url.searchParams),
                user: null, // Буде заповнено в middleware авторизації
            }

            // Виконуємо цепочку middleware перед підключенням (аналог io.use)
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
                    // Всі перевірки пройдено — пускаємо в namespace
                    const nsp = this.namespaces.get(nspName)
                    nsp.handleConnection(ws, handshake)
                }
            }

            await next()
        })
    }

    of(name) {
        if (!this.namespaces.has(name)) {
            this.namespaces.set(name, new Namespace(name, this))
        }
        return this.namespaces.get(name)
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
