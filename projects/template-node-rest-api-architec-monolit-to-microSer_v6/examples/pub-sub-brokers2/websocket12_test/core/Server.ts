import crypto from 'crypto'
import { WebSocketServer, WebSocket } from 'ws'
import { IncomingMessage } from 'http'
import { Namespace } from './Namespace'
import { LocalAdapter } from '../adapters/LocalAdapter'

interface ServerConfig {
    nodeId: string
    adapter?: any
    pathPrefix?: string
}

export class Server {
    private nodeId: any
    private nsp: Map<string, Namespace> = new Map()
    private wss: WebSocketServer
    public readonly sockets: Namespace
    private readonly AdapterClass: any

    constructor(port: number, private config: ServerConfig) {
        this.nodeId = config.nodeId || crypto.randomUUID

        this.AdapterClass = config.adapter || LocalAdapter

        this.sockets = this.of('/')

        this.wss = new WebSocketServer({ port })

        this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
            this.handleConnection(ws, req)
        })

        this.wss.on('error', (error) => {
            console.error('WebSocket Server Error:', error)
        })
    }

    private handleConnection(ws: WebSocket, req: IncomingMessage) {
        if (!req.url) return ws.terminate()

        try {
            const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
            let path = url.pathname

            if (this.config.pathPrefix) {
                if (path.startsWith(this.config.pathPrefix)) {
                    path = path.slice(this.config.pathPrefix.length)
                } else {
                    // Якщо шлях не починається з префікса - відхиляємо
                    ws.close(1000, 'Invalid Path Prefix')
                    return
                }
            }

            if (!path.startsWith('/')) path = '/' + path

            const nsp = this.nsp.get(path)
            if (!nsp) {
                ws.send(JSON.stringify({ error: 'Invalid namespace', path }))
                ws.close()
                return
            }

            // Передаємо з’єднання в Namespace
            nsp._onConnection(ws, req)
        } catch (error) {
            ws.terminate()
        }
    }

    public of(path: string): Namespace {
        const normalizedPath = path.startsWith('/') ? path : `/${path}`

        if (!this.nsp.has(normalizedPath)) {
            this.nsp.set(
                normalizedPath,
                new Namespace(normalizedPath, this.AdapterClass, this.config.nodeId),
            )
        }
        return this.nsp.get(normalizedPath)!
    }

    public close() {
        this.wss.close()
        this.nsp.forEach((n) => n.close?.())
    }

    // Проксі-методи для дефолтного NS (аналог io.on, io.emit)
    public on(event: string, fn: (socket: any) => void) {
        this.sockets.on(event, fn)
    }

    public use(fn: any) {
        this.sockets.use(fn)
    }

    public emit(event: string, ...args: any[]) {
        return this.sockets.emit(event, ...args)
    }

    public to(room: string) {
        return this.sockets.to(room)
    }
}
