// Server.js
import { WebSocketServer } from 'ws'
import crypto from 'crypto'
import { Namespace } from './Namespace.js'
import { Socket } from './Socket.js'

export class MyIoServer {
    constructor(port, { stateAdapter, brokerAdapter, logger }) {
        this.serverId = crypto.randomUUID()
        this.logger = logger.child(`Server`)
        this.wss = new WebSocketServer({ port })

        this.deps = {
            state: stateAdapter,
            broker: brokerAdapter,
            logger: this.logger,
            serverId: this.serverId,
        }

        this.namespaces = new Map()
        this._bind()
    }

    _bind() {
        this.wss.on('connection', (ws, req) => {
            const nsName = req.url === '/' ? '/' : req.url
            const ns = this.of(nsName)

            const socket = new Socket(ws, ns, this.logger)
            ns.localSockets.set(socket.id, socket)

            ns._emitInternal('connection', socket)

            ws.on('close', () => {
                ns._removeSocket(socket)
                this.logger.debug(`Socket ${socket.id} closed`)
            })
        })

        this.logger.info(`IO Server running on port ${this.wss.options.port}`)
    }

    of(name) {
        if (!this.namespaces.has(name)) {
            this.namespaces.set(name, new Namespace(name, this.deps))
        }
        return this.namespaces.get(name)
    }
}
