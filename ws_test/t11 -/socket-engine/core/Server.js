import { WebSocketServer } from 'ws'
import { Namespace } from './Namespace.js'

export class Server {
    constructor(srv, opts = {}) {
        this.wss = new WebSocketServer({ server: srv, ...opts })
        this.namespaces = new Map()

        // Автоматично створюємо кореневий простір імен
        this.namespaces.set('/', new Namespace('/', this))

        if (srv) {
            this.attach(srv)
        }
    }

    // Ледаче (відкладене) прикріплення до HTTP/HTTPS сервера
    attach(srv, opts = {}) {
        if (this.wss) {
            throw new Error('Server is already attached to an HTTP server.')
        }
        this.wss = new WebSocketServer({ server: srv, ...this.opts, ...opts })
        this.init()
    }

    init() {
        this.wss.on('connection', (ws, req) => {
            const url = new URL(req.url, 'http://localhost')
            const nspName = url.pathname === '/' ? '/' : url.pathname

            // СУВОРА ПЕРЕВІРКА: Дозволено підключатися лише до заздалегідь оголошених просторів імен
            if (!this.namespaces.has(nspName)) {
                ws.close(4404, 'Namespace Not Found')
                return
            }

            const nsp = this.namespaces.get(nspName)
            nsp.handleConnection(ws, req)
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

    except(room) {
        return this.of('/').except(room)
    }

    emit(event, ...args) {
        this.of('/').emit(event, ...args)
    }
}
