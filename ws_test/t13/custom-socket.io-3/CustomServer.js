import { WebSocketServer } from 'ws'
import url from 'url'
import { Namespace } from './Namespace.js'

export class CustomServer {
    constructor(httpServer) {
        this.namespaces = new Map()
        this.dynamicNamespaces = new Map()

        // Створюємо дефолтний простір імен за замовчуванням
        this.defaultNsp = this.of('/')

        this.wss = new WebSocketServer({ noServer: true })

        httpServer.on('upgrade', (request, socket, head) => {
            const parsedUrl = url.parse(request.url, true)
            const pathname = parsedUrl.pathname || '/'

            let nsp = this._findNamespace(pathname)

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
        if (namespaceName instanceof RegExp) {
            if (!this.dynamicNamespaces.has(namespaceName)) {
                this.dynamicNamespaces.set(namespaceName, new Namespace(namespaceName))
            }
            return this.dynamicNamespaces.get(namespaceName)
        }

        if (!this.namespaces.has(namespaceName)) {
            this.namespaces.set(namespaceName, new Namespace(namespaceName))
        }
        return this.namespaces.get(namespaceName)
    }

    // _findNamespace(pathname) {
    //     if (this.namespaces.has(pathname)) {
    //         return this.namespaces.get(pathname)
    //     }

    //     for (const [regex, nsp] of this.dynamicNamespaces.entries()) {
    //         if (regex.test(pathname)) {
    //             return nsp
    //         }
    //     }
    //     return null
    // }

    _findNamespace(pathname) {
        // 1. Спочатку шукаємо точний збіг по рядку
        if (this.namespaces.has(pathname)) {
            return this.namespaces.get(pathname)
        }

        // 2. Якщо точного збігу немає, перевіряємо динамічні RegExp
        for (const [regex, baseNsp] of this.dynamicNamespaces.entries()) {
            if (regex.test(pathname)) {
                // НЮАНС: Щоб клієнти з різних URL (наприклад /chats/1 і /chats/2) не перетиналися в розсилках,
                // ми створюємо для кожного унікального шляху СВІЙ ізольований інстанс Namespace.
                // Це копіює поведінку Socket.io.
                if (!this.namespaces.has(pathname)) {
                    // Створюємо новий Namespace, але копіюємо туди всі налаштовані middlewares та listeners від RegExp шаблону
                    const childNsp = new Namespace(pathname, baseNsp.AdapterClass) // Передаємо той самий клас адаптера
                    childNsp._middlewares = baseNsp._middlewares
                    childNsp._connectionListeners = baseNsp._connectionListeners

                    this.namespaces.set(pathname, childNsp)
                }
                return this.namespaces.get(pathname)
            }
        }
        return null
    }

    // Проксі методи сервера на дефолтний namespace
    on(eventName, callback) {
        return this.defaultNsp.on(eventName, callback)
    }
    use(fn) {
        return this.defaultNsp.use(fn)
    }
    to(room) {
        return this.defaultNsp.to(room)
    }
    emit(eventName, ...args) {
        this.defaultNsp.emit(eventName, ...args)
    }
}
