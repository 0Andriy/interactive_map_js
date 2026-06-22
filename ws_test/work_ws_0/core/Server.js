import { WebSocketServer, WebSocket } from 'ws'
import crypto from 'crypto'
import { Namespace } from './Namespace.js'
import { Adapter } from './Adapter.js'

export class Server {
    constructor(httpServer, options = {}) {
        // Конфігурація з дефолтними значеннями
        // Об'єкт конфігурації з дефолтними значеннями
        this.options = {
            basePath: '/ws', // шлях за замовчуванням
            adapter: Adapter, // клас адаптера
            serverId: crypto.randomUUID(), // унікальний ID цього вузла
            logger: options.logger || null, // логер (Pino, Winston або console)
            pingInterval: 25000, // Як в Socket.io по замовчуванню
            pingTimeout: 5000, // Час очікування відповіді
            ...options,
        }

        // Реєстр неймспейсів: Назва -> Екземпляр Namespace
        this.namespaces = new Map()

        this.logger =
            options.logger?.child?.({
                component: 'WS Server',
                serverId: this.options.serverId,
            }) ?? options.logger

        // Ініціалізація головного неймспейсу за замовчуванням
        this._defaultNamespace = this.of('/')

        // Створюємо WebSocket сервер без прив'язки до порту (через noServer)
        this.wss = new WebSocketServer({
            noServer: true,
            ...this.options,
        })

        // Налаштовуємо перехват Upgrade запитів від HTTP сервера
        this._setupUpgradeHandler(httpServer)
        this._setupHeartbeat()

        this.logger?.info?.('Socket server initialized', { basePath: this.options.basePath })
    }

    /**
     * Створює або повертає існуючий Namespace.
     * @param {string} name - Назва неймспейсу (наприклад, '/chat')
     */
    of(name) {
        // Гарантуємо, що назва починається з '/'
        const nspName = name.startsWith('/') ? name : `/${name}`

        if (!this.namespaces.has(nspName)) {
            const nsp = new Namespace(
                nspName,
                this.options.adapter,
                this.options.serverId,
                this.options.logger,
            )

            this.namespaces.set(nspName, nsp)
            this.logger?.debug?.(`Namespace created: ${nspName}`, { nsp: nspName })
        }

        return this.namespaces.get(nspName)
    }

    /**
     * Обробка запиту на оновлення протоколу з HTTP на WebSocket.
     */
    _setupUpgradeHandler(httpServer) {
        httpServer.on('upgrade', async (request, socket, head) => {
            try {
                const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
                const pathname = url.pathname

                // 1. Захист: перевіряємо, чи шлях починається з нашого базового basePath (напр. /socket.io)
                // Також перевіряємо, щоб basePath не був порожнім
                if (!this.options.basePath || !pathname.startsWith(this.options.basePath)) {
                    socket.destroy()
                    return // Ігноруємо запит, він не для нас
                }

                // 2. Вираховуємо назву неймспейсу
                // Відрізаємо базовий шлях. Наприклад: "/socket.io/chat" -> "/chat"
                let nspName = pathname.substring(this.options.basePath.length)

                // Якщо після відрізання порожньо — це головний неймспейс '/'
                if (nspName === '' || nspName === '/') {
                    nspName = '/'
                } else if (!nspName.startsWith('/')) {
                    nspName = '/' + nspName
                }

                // 3. Захист: перевіряємо, чи неймспейс зареєстрований
                // Ми не створюємо неймспейси автоматично для безпеки
                const nsp = this.namespaces.get(nspName)

                if (!nsp) {
                    this.logger?.warn?.('Attempt to connect to unauthorized namespace', {
                        nsp: nspName,
                    })
                    socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
                    socket.destroy()
                    return
                }

                // ! тут треба додати аутентифікацію бо є проблеми з Race Condition з OPEN подією на клієнті
                // ! або черга як в nsp.addConnection(ws, request)
                // 🔥 4. АВТЕНТИФІКАЦІЯ ДО СТВОРЕННЯ WEBSOCKET (Запобігає передчасному OPEN на клієнті)
                let authorizedSocket = null
                let authErrorInstance = null
                try {
                    // Метод повертає об'єкт сокета, якщо авторизація успішна
                    authorizedSocket = await nsp._runAuthorize(request)
                } catch (authError) {
                    authErrorInstance = authError
                    this.logger?.warn?.('Authorization failed during HTTP upgrade', {
                        nsp: nspName,
                        error: authError.message,
                    })

                    // Повертаємо HTTP помилку 401. Клієнт отримає error і НЕ викличе подію open/connect
                    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
                    socket.destroy()
                    return
                }

                // 5. Завершуємо Upgrade, якщо перевірки успішні
                // Успішно! Клієнт отримує мережевий OPEN тільки зараз
                this.wss.handleUpgrade(request, socket, head, (ws) => {
                    // if (authErrorInstance) {
                    //     this.logger?.warn?.('Authorization failed, closing WS with 4401', {
                    //         nsp: nspName,
                    //         error: authErrorInstance.message,
                    //     })
                    //     // 🔥 Нативно закриваємо сокет із кастомним кодом 4401.
                    //     // Клієнт миттєво зловить цей код у своєму `onclose`!
                    //     ws.close(4401, 'Unauthorized')
                    //     return
                    // }

                    // Передаємо вже створений сокет далі
                    nsp.addConnection(ws, request, authorizedSocket)
                })
            } catch (error) {
                this.logger?.error?.('Upgrade handler error', { error: error.message })
                socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
                socket.destroy()
            }
        })
    }

    // --- Проксі-методи для головного неймспейсу ('/') ---
    // Дозволяють використовувати синтаксис io.emit(), io.use() тощо.

    /**
     * Реєстрація middleware для головного неймспейсу
     */
    use(fn) {
        this._defaultNamespace.use(fn)
        return this
    }

    /**
     * Вибір кімнат для відправки (головний nsp)
     */
    to(room) {
        return this._defaultNamespace.to(room)
    }

    /**
     * Аліас для to()
     */
    in(room) {
        return this._defaultNamespace.in(room)
    }

    /**
     * Відправка всім у головному неймспейсі
     */
    emit(event, args) {
        return this._defaultNamespace.emit(event, args)
    }

    /**
     * Слухач подій головного неймспейсу (наприклад, 'connection')
     */
    on(event, callback) {
        this._defaultNamespace.on(event, callback)
        return this
    }

    /**
     * Отримати список усіх сокетів у головному неймспейсі
     */
    async fetchSockets() {
        return this._defaultNamespace.fetchSockets()
    }

    /**
     * Отримати кількість людей у кімнаті (головний nsp)
     */
    getRoomSize(room) {
        return this._defaultNamespace.getRoomSize(room)
    }

    _setupHeartbeat() {
        this.checkInterval = setInterval(() => {
            this.namespaces.forEach((nsp) => {
                nsp.sockets.forEach((socket) => {
                    // Якщо не було відповіді на минулий ping - розриваєм зєднання
                    if (socket.isAlive === false) {
                        this.logger?.debug?.('Ping timeout, disconnecting socket', {
                            id: socket.id,
                        })
                        return socket.disconnect()
                    }

                    // Помічаємо як "очікуємо відповіді" і відправляємо ping
                    socket.isAlive = false
                    socket.ping()
                })
            })
        }, this.options.pingInterval)
    }

    /**
     * Повне закриття сервера та всіх з'єднань
     */
    async close() {
        this.logger?.info?.('Closing socket server...')

        // 1. Зупиняємо пінг-понги або інші таймери
        if (this.checkInterval) {
            clearInterval(this.checkInterval)
        }

        // 2. Закриваємо кастомні простори імен (namespaces)
        for (const nsp of this.namespaces.values()) {
            if (typeof nsp.close === 'function') {
                await nsp.close()
            }
        }
        this.namespaces.clear()

        // 3. Примусово завершуємо з'єднання з УСІМА активними клієнтами
        if (this.wss?.clients) {
            for (const client of this.wss.clients) {
                // terminate() миттєво рве TCP-канал, не чекаючи рукостискань
                client.terminate()
            }
        }

        // 4. Очікуємо реального закриття самого сервера через Promise
        if (this.wss && typeof this.wss.close === 'function') {
            await new Promise((resolve) => {
                // Внутрішній запобіжник суто для цього сервера
                const localTimeout = setTimeout(() => {
                    this.logger?.warn?.('WSS close callback timed out, forcing resolve.')
                    resolve()
                }, 3000)

                this.wss.close(() => {
                    clearTimeout(localTimeout)
                    resolve()
                })
            })
        }
    }
}
