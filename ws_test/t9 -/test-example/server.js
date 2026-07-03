import { WebSocketServer } from 'ws'
import { Namespace } from './namespace.js'
import { Adapter } from './adapter.js'

export class Server {
    constructor(serverOptions = {}, customAdapter = Adapter, heartbeatManager = null) {
        this._namespaces = new Map()
        this.customAdapter = customAdapter
        this.heartbeatManager = heartbeatManager

        this.of('/')

        if (serverOptions.server || serverOptions.port) {
            this.attach(serverOptions)
        }
    }

    of(name) {
        if (!this._namespaces.has(name)) {
            this._namespaces.set(
                name,
                new Namespace(name, this.customAdapter, undefined, this.heartbeatManager),
            )
        }
        return this._namespaces.get(name)
    }

    use(fn) {
        this.of('/').use(fn)
        return this
    }

    attach(opts) {
        this.wss = new WebSocketServer(opts)
        this.wss.on('connection', async (ws, req) => {
            const url = new URL(req.url, 'http://localhost')
            const nspName = url.pathname === '/' ? '/' : url.pathname

            const nsp = this._namespaces.get(nspName)
            if (!nsp) {
                ws.close(4404, 'Namespace missing')
                return
            }

            const handshake = {
                headers: req.headers,
                query: Object.fromEntries(url.searchParams),
                address: req.socket.remoteAddress,
            }

            const id = Math.random().toString(36).substring(2, 15)
            await nsp.add(id, ws, handshake)
        })
    }

    on(ev, fn) {
        return this.of('/').on(ev, fn)
    }
    to(room) {
        return this.of('/').to(room)
    }
    emit(ev, ...args) {
        return this.of('/').emit(ev, ...args)
    }
}
