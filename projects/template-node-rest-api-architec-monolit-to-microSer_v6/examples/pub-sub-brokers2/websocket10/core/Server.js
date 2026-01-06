import { WebSocketServer } from 'ws'
// import { Namespace } from './Namespace.js'
// import { Socket } from './Socket.js'
import crypto from 'crypto'

export class WSServer {
    #logger = null
    #heartbeatTimer = null
    #isClosing = false
    #stateAdapter = null
    #brokerAdapter = null
    #brokerChannel = null
    #brokerUnsubscribe = null

    constructor({
        server,
        basePath = '/ws',
        wssOptions = {},
        stateAdapter = null,
        brokerAdapter = null,
        logger = null,
    } = {}) {
        this.serverId = crypto.randomUUID()

        this.server = server
        this.basePath = this.#normalizePath(basePath)
        this.#brokerChannel = `ws:global`

        this.#stateAdapter = stateAdapter
        this.#brokerAdapter = brokerAdapter

        this.sockets = new Map()
        this.namespaces = new Map()
        this.createdAt = new Date()

        this.#logger = logger.child
            ? logger.child({
                  component: `${this.constructor.name}`,
                  serverId: this.serverId,
              })
            : logger

        this.wss = new WebSocketServer({
            noServer: true,
            path: basePath,
            ...wssOptions,
        })

        this.#init()
        this.#initGlobalHeartbeat()
        this.#initBrokerSubscriptions()

        this.of('/')

        this.#logger?.info?.(`[${this.constructor.name}] WS Server initialized.`, {
            basePath: this.basePath,
            brokerChannel: this.#brokerChannel,
            createdAt: this.createdAt,
        })
    }

    /* ===============================
     * Getters
     * =============================== */
    get uptime() {
        return Date.now() - this.createdAt.getTime()
    }

    get state() {
        return this.#stateAdapter
    }

    get broker() {
        return this.#brokerAdapter
    }

    /* ===============================
     * Public API
     * =============================== */

    of(nameNamespace) {
        if (!nameNamespace || typeof nameNamespace !== 'string' || eventName.length === 0) {
            throw new TypeError(
                `[${this.constructor.name}] nameNamespace must be a non-empty string`,
            )
        }

        const nsName = this.#normalizePath(nameNamespace)

        let namespace = this.namespaces.get(nsName)
        if (!namespace) {
            namespace = new Namespace(nsName, {
                server: this,
                stateAdapter: this.#stateAdapter,
                brokerAdapter: this.#brokerAdapter,
                logger: this.#logger,
            })
            this.namespaces.set(nsName, namespace)

            this.#logger?.info?.(`[${this.constructor.name}] Namespace created: ${nsName}`, {
                nsName: nsName,
            })
        }

        return namespace
    }

    broadcast(event, data, senderId = null, targetNsName = null) {
        // 1. Локальна розсилка всім підключеним до цього вузла
        this.#dispatchLocal(event, data, senderId, targetNsName)

        // 2. Публікація в брокер для інших вузлів кластера
        if (this.#brokerAdapter) {
            this.#brokerAdapter.publish(this.#brokerChannel, {
                from: this.serverId,
                event,
                data,
                senderId,
                targetNsName,
            })
        }
    }

    getLocalStats() {
        const stats = {}
        for (const [name, ns] of this.namespaces) {
            stats[name] = ns.getLocalClients()
        }
        return stats
    }

    async close() {
        if (this.#isClosing) return
        this.#isClosing = true

        if (this.#heartbeatTimer) {
            clearInterval(this.#heartbeatTimer)
        }

        if (this.#brokerUnsubscribe) {
            try {
                await this.#brokerUnsubscribe()
                this.#logger?.debug?.(
                    `[${this.constructor.name}] Broker unsubscribed via cleanup function`,
                )
            } catch (error) {
                this.#logger?.error?.(
                    `[${this.constructor.name}] Broker cleanup function failed`,
                    error,
                )
            }
        }

        for (const ns of [...this.namespaces.values()]) {
            ns.destroy()
        }
        this.namespaces.clear()

        return new Promise((resolve, reject) => {
            this.wss.close((err) => {
                this.#logger?.info?.(`[${this.constructor.name}] WSServer destroyed`)

                if (err) {
                    this.#logger?.error?.(`[${this.constructor.name}] Close error`, err)
                    return reject(err)
                }
                this.#logger?.info?.(`[${this.constructor.name}] Stopped`)
                resolve()
            })
        })
    }

    /* ===============================
     * Internal helpers
     * =============================== */

    #normalizePath(path) {
        if (typeof path !== 'string') return '/'
        const trimmed = path.trim()
        const leading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
        return leading.length > 1 && leading.endsWith('/') ? leading.slice(0, -1) : leading
    }

    #init() {
        // Обробка Upgrade запитів
        this.server.on('upgrade', (request, socket, head) => {
            const { pathname } = new URL(request.url, `http://${request.headers.host}`)

            if (pathname.startsWith(this.basePath)) {
                this.wss.handleUpgrade(request, socket, head, (ws) => {
                    this.wss.emit('connection', ws, request)
                })
            }
        })

        // Основний обробник нових з'єднань
        this.wss.on('connection', async (ws, req) => {
            try {
                const url = new URL(req.url, `http://${req.headers.host}`)
                const relativePath = url.pathname.slice(this.basePath.length)
                const nsName = this.#normalizePath(relativePath)

                const namespace = this.of(nsName)
                const socketId = crypto.randomUUID()

                const socket = new Socket({
                    id: socketId,
                    rawSocket: ws,
                    namespace: namespace,
                    logger: this.#logger,
                })

                socket.handshake = {
                    url: req.url,
                    headers: req.headers,
                    query: Object.fromEntries(url.searchParams),
                    address: req.socket.remoteAddress,
                    secure: req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted,
                    issued: Date.now(),
                }

                await namespace.addSocket(socket)

                //
                ws.on('close', () => {
                    namespace.removeSocket(socketId)
                })

                //
                ws.on('error', (error) => {
                    this.#logger?.error?.(`[${this.constructor.name}] Socket transport error`, {
                        socketId: socket.id,
                        error: error.message,
                    })
                })
            } catch (error) {
                this.#logger?.error?.(`[${this.constructor.name}] Connection handling failed`, {
                    error: error.message,
                })
                ws.terminate()
            }
        })

        //
        this.wss.on('error', (error) => {
            this.#logger?.error?.(`[${this.constructor.name}] WSS Global Error:`, error)
        })
    }

    #initBrokerSubscriptions() {
        if (!this.#brokerAdapter) return

        // Підписка на глобальні повідомлення від інших серверів
        const result = this.#brokerAdapter.subscribe(this.#brokerChannel, (msg) => {
            // Echo Protection: ігноруємо власні повідомлення
            if (this.#isClosing || msg.from === this.serverId) return

            this.#logger?.debug?.(
                `[${this.constructor.name}] Broker Received global broadcast from ${msg.from}`,
            )
            this.#dispatchLocal(msg.event, msg.data, msg.senderId, msg.targetNsName)
        })

        // Якщо subscribe повернув функцію — зберігаємо її для close()
        if (typeof result === 'function') {
            this.#brokerUnsubscribe = result
        }
    }

    #dispatchLocal(event, data, senderId = null, targetNsName = null) {
        if (targetNsName) {
            const ns = this.namespaces.get(targetNsName)
            if (!ns) {
                return
            }

            ns.localEmit(event, data, senderId)
        } else {
            for (const ns of this.namespaces.values()) {
                ns.localEmit(event, data, senderId)
            }
        }
    }

    #initGlobalHeartbeat() {
        this.#heartbeatTimer = setInterval(() => {
            for (const ns of this.namespaces.values()) {
                for (const socket of ns.sockets.values()) {
                    if (!socket.isAlive) {
                        socket.logger?.info?.(
                            `[${socket.constructor.name}] Terminating inactive socket`,
                            {
                                nsName: ns.name,
                                socketId: socket.id,
                                uptime: socket.uptime,
                            },
                        )
                        socket.disconnect(4000, 'Heartbeat timeout')
                        continue
                    }

                    socket.isAlive = false

                    if (socket.rawSocket.readyState !== socket.rawSocket.OPEN) {
                        return
                    }

                    socket.ping()
                }
            }
        }, 30000)

        this.#heartbeatTimer.unref()
    }
}
