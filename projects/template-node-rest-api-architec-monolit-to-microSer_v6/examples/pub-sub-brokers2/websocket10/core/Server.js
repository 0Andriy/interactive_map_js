import { WebSocketServer } from 'ws'
import { Namespace } from './Namespace.js'
import { Socket } from './Socket.js'
import crypto from 'crypto'

export class WSServer {
    #logger = null
    #heartbeatTimer = null
    #isClosing = false
    #stateAdapter = null
    #brokerAdapter = null
    #brokerChannel = null
    #brokerUnsubscribe = null

    constructor(options = {}) {
        this.options = options

        this.serverId = options.serverId || crypto.randomUUID()
        this.basePath = options.path ? this.#normalizePath(options.path) : '/'
        this.createdAt = new Date()

        this.namespaces = new Map()

        this.#stateAdapter = options.stateAdapter
        this.#brokerAdapter = options.brokerAdapter
        this.#brokerChannel = `ws:global`

        if (options.logger) {
            this.#logger = options.logger.child
                ? options.logger.child({
                      component: this.constructor.name,
                      serverId: this.serverId,
                  })
                : options.logger
        }

        this.wss = new WebSocketServer(options)

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
        if (!nameNamespace || typeof nameNamespace !== 'string') {
            throw new TypeError(
                `[${this.constructor.name}] nameNamespace must be a non-empty string`,
            )
        }

        const nsName = this.#normalizePath(nameNamespace)

        let namespace = this.namespaces.get(nsName)
        if (!namespace) {
            namespace = new Namespace(nsName, {
                serverId: this.serverId,
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

    async broadcast(event, data, senderId = null, targetNsName = null) {
        if (!event) {
            this.#logger?.error?.(
                `[${this.constructor.name}] Broadcast failed: event name is required`,
            )
            return
        }

        // 1. Локальна розсилка всім підключеним до цього вузла
        try {
            await this.#dispatchLocal(event, data, senderId, targetNsName)
        } catch (error) {
            this.#logger?.error?.(`[${this.constructor.name}] Local dispatch error`, {
                error,
                event,
            })
        }

        // 2. Публікація в брокер для інших вузлів кластера
        if (this.#brokerAdapter) {
            try {
                await this.#brokerAdapter.publish(this.#brokerChannel, {
                    fromServerId: this.serverId,
                    event,
                    data,
                    senderId,
                    targetNsName,
                })
            } catch (error) {
                this.#logger?.error?.(`[${this.constructor.name}] Broker publish error`, {
                    error,
                    channel: this.#brokerChannel,
                })
            }
        }
    }

    handleUpgrade(server = null) {
        if (!server) {
            return
        }

        if (this.wss.options.server || this.wss.options.port) {
            this.#logger?.info?.(
                `[${this.constructor.name}] handleUpgrade skipped: wss is already managing the server`,
                {
                    basePath: this.basePath,
                },
            )
            return
        }

        const onUpgrade = async (request, socket, head) => {
            const { pathname } = new URL(request.url, `http://${request.headers.host}`)

            if (pathname === this.basePath) {
                this.wss.handleUpgrade(request, socket, head, (ws) => {
                    this.wss.emit('connection', ws, request)
                })
                return
            }

            // Отримуємо кількість усіх функцій-обробників події 'upgrade'
            const listeners = server.listeners('upgrade')

            // Зберігаємо лічильник перевірок у самому сокеті
            socket.checkCount = (socket.checkCount || 0) + 1

            // Якщо цей обробник був останнім у списку і ніхто не підтвердив обробку
            if (socket.checkCount === listeners.length) {
                this.#logger?.warn?.(
                    `[${this.constructor.name}] Path not found, closing connection on upgrade.`,
                    { pathname },
                )

                socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
                socket.destroy()
            }
        }

        server.on('upgrade', onUpgrade)
        server.once('close', () => {
            server.removeListener('upgrade', onUpgrade)
        })

        this.#logger?.info?.(`[${this.constructor.name}] Upgrade handler attached to server`, {
            basePath: this.basePath,
        })
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

    #normalizePath(path = '/') {
        if (typeof path !== 'string') return null
        const trimmed = path.trim()
        const leading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
        return leading.length > 1 && leading.endsWith('/') ? leading.slice(0, -1) : leading
    }

    #init() {
        this.wss.on('connection', async (ws, req) => {
            if (this.#isClosing) {
                ws.terminate()
                return
            }

            try {
                const url = new URL(req.url, `${req.protocol}://${req.headers.host}`)
                const relativePath = url.pathname.slice(this.basePath.length)
                const nsName = this.#normalizePath(relativePath)

                const namespace = this.namespaces.get(nsName)
                if (!namespace) {
                    this.#logger?.warn?.(
                        `[${this.constructor.name}] Attempt to connect to non-existent namespace: ${nsName}`,
                    )
                    ws.close(4004, 'Not Found Namespace')
                    ws.terminate()
                    return
                }

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

                //
                ws.on('close', () => {
                    namespace.removeSocket(socketId)
                })

                await namespace.addSocket(socket)

                //
                ws.on('error', (error) => {
                    this.#logger?.error?.(`[${this.constructor.name}] Socket transport error`, {
                        socketId: socketId,
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

    async #initBrokerSubscriptions() {
        if (!this.#brokerAdapter) return

        // Підписка на глобальні повідомлення від інших серверів
        const result = await this.#brokerAdapter.subscribe(this.#brokerChannel, (msg) => {
            if (this.#isClosing) return
            // Echo Protection: ігноруємо власні повідомлення
            if (msg.fromServerId && msg.fromServerId === this.serverId) return

            this.#logger?.debug?.(
                `[${this.constructor.name}] Broker received broadcast from ${msg.fromServerId}`,
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
            return
        }

        for (const ns of this.namespaces.values()) {
            ns.localEmit(event, data, senderId)
        }
    }

    #initGlobalHeartbeat() {
        this.#heartbeatTimer = setInterval(() => {
            for (const ns of [...this.namespaces.values()]) {
                for (const socket of [...ns.sockets.values()]) {
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

                    socket.ping()
                }
            }
        }, 30000)

        this.#heartbeatTimer.unref()
    }
}
