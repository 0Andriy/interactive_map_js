import { WebSocketServer } from 'ws'
import url from 'url'
import { Namespace } from './Namespace.js'

export class CustomServer {
    constructor(httpServer) {
        this.namespaces = new Map()
        this.wss = new WebSocketServer({ noServer: true })

        httpServer.on('upgrade', (request, socket, head) => {
            const parsedUrl = url.parse(request.url, true)
            const nsp = this.namespaces.get(parsedUrl.pathname)

            if (!nsp) {
                socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
                socket.destroy()
                return
            }

            const token = parsedUrl.query?.token || request.headers['authorization']

            this.wss.handleUpgrade(request, socket, head, (ws) => {
                nsp._handleConnection(ws, {
                    auth: { token },
                    headers: request.headers,
                })
            })
        })
    }

    of(namespaceName) {
        if (!this.namespaces.has(namespaceName)) {
            this.namespaces.set(namespaceName, new Namespace(namespaceName))
        }
        return this.namespaces.get(namespaceName)
    }

    emit(eventName, ...args) {
        this.namespaces.forEach((nsp) => nsp.emit(eventName, ...args))
    }
}
