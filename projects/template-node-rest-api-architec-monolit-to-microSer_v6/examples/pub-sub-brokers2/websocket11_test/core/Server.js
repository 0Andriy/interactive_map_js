import { WebSocketServer } from 'ws'
import { v4 as uuidv4 } from 'uuid'
import { Namespace } from './Namespace.js'
import { Adapter } from './Adapter.js'

export class NexusServer {
    constructor(options = {}) {
        this.options = options
        this.serverId = uuidv4()
        this.wss = new WebSocketServer(options)
        this.AdapterConstructor = options.adapter || Adapter
        this.namespaces = new Map()

        this.of('/') // Ініціалізація головного простору

        this.wss.on('connection', (ws, req) => {
            const url = new URL(req.url, `http://${req.headers.host}`)
            console.log(url)
            const nspName = url.pathname
            console.log(nspName)

            // ПЕРЕВІРКА: чи існує такий namespace
            if (this.namespaces.has(nspName)) {
                this.namespaces.get(nspName).add(ws)
            } else {
                // Якщо namespace не існує — відхиляємо з'єднання
                ws.send(
                    JSON.stringify({ event: 'error', payload: `Namespace ${nspName} not found` }),
                )
                ws.terminate()
                console.log(`[Server] Connection rejected: Namespace ${nspName} does not exist.`)
            }
        })
    }

    of(name) {
        if (!this.namespaces.has(name)) {
            this.namespaces.set(name, new Namespace(name, this))
        }
        return this.namespaces.get(name)
    }

    // ПРОКСІ: дозволяє писати io.on('connection', ...) замість io.of('/').on(...)
    on(event, callback) {
        return this.of('/').on(event, callback)
    }

    emit(event, payload) {
        return this.of('/').emit(event, payload)
    }

    to(room) {
        return this.of('/').to(room)
    }

    //
    close() {
        return new Promise((resolve) => this.wss.close(resolve))
    }
}
