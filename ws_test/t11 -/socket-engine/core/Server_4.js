import { WebSocketServer } from 'ws'
import { Namespace } from './Namespace.js'
import crypto from 'crypto'

export class Server {
    constructor(srv, opts = {}, dependencies = {}) {
        this.wss = null
        this.opts = {
            path: opts.path || '',
            cors: opts.cors || { origin: '*' },
            ...opts,
        }

        if (!dependencies.AdapterClass) {
            throw new Error('Dependency Injection Error: AdapterClass is required.')
        }
        this.AdapterClass = dependencies.AdapterClass

        this.namespaces = []
        this.plugins = []
        this.connectionMiddlewares = []

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

    checkCors(req) {
        const origin = req.headers.origin
        const allowedOrigin = this.opts.cors.origin

        if (allowedOrigin === '*') return true
        if (Array.isArray(allowedOrigin) && allowedOrigin.includes(origin)) return true
        if (typeof allowedOrigin === 'function' && allowedOrigin(origin)) return true
        if (allowedOrigin === origin) return true

        return false
    }

    matchNamespace(pathname) {
        let targetPath = pathname
        if (this.opts.path && pathname.startsWith(this.opts.path)) {
            targetPath = pathname.substring(this.opts.path.length) || '/'
        }

        return this.namespaces.find((nsp) => {
            if (nsp.name instanceof RegExp) return nsp.name.test(targetPath)
            return nsp.name === targetPath
        })
    }

    // 🚀 СУЧАСНИЙ UPGRADE МЕХАНІЗМ [2]
    attach(srv) {
        if (this.wss) throw new Error('Server is already attached.')

        this.wss = new WebSocketServer({ noServer: true, ...this.opts })

        srv.on('upgrade', async (req, socket, head) => {
            const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

            if (!this.checkCors(req)) {
                socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
                socket.destroy()
                return
            }

            const matchedNsp = this.matchNamespace(url.pathname)
            if (!matchedNsp) {
                socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
                socket.destroy()
                return
            }

            const handshake = {
                id: crypto.randomUUID(),
                url: req.url,
                pathname: url.pathname,
                headers: req.headers,
                cookies: this.parseCookies(req.headers.cookie),
                address: socket.remoteAddress,
                referer: req.headers.referer || '',
                issued: Date.now(),
                query: Object.fromEntries(url.searchParams),
                user: null,
            }

            let index = 0
            const next = async (err) => {
                if (err) {
                    socket.write(
                        `HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\n\r\n${err.message || 'Unauthorized'}`,
                    )
                    socket.destroy()
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
                    this.wss.handleUpgrade(req, socket, head, (ws) => {
                        this.wss.emit('connection', ws, req, matchedNsp, handshake)
                    })
                }
            }

            await next()
        })

        this.init()
    }

    init() {
        this.wss.on('connection', (ws, req, matchedNsp, handshake) => {
            matchedNsp.handleConnection(ws, handshake)
        })
    }

    parseCookies(cookieHeader) {
        if (!cookieHeader) return {}
        return Object.fromEntries(cookieHeader.split(';').map((c) => c.trim().split('=')))
    }

    of(name) {
        const existing = this.namespaces.find((nsp) => nsp.name.toString() === name.toString())
        if (existing) return existing

        const nsp = new Namespace(name, this, this.AdapterClass)
        this.namespaces.push(nsp)
        return nsp
    }

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
