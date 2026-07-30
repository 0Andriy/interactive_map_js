import { WebSocketServer } from 'ws'
import { Namespace } from './Namespace.js'
import { ConnWrapper } from './ConnWrapper.js'
import { InMemoryAdapter } from './InMemoryAdapter.js'

/**
 * Головний вхідний клас сервера (Аналог `new Server()` або `io()` в Socket.IO).
 */
export class Server {
    /**
     * @param {Object} [serverOptions={}] - Опції для WebSocketServer (наприклад, port або server).
     * @param {Function} [AdapterClass=InMemoryAdapter] - Адаптер, який буде передано просторам імен.
     */
    constructor(serverOptions = {}, AdapterClass = InMemoryAdapter) {
        this.AdapterClass = AdapterClass

        /**
         * Карта просторів імен, де ключ — шлях (наприклад, '/' або '/chat').
         * @type {Map<string, Namespace>}
         */
        this.namespaces = new Map()

        // Автоматично створюємо дефолтний простір імен, як у Socket.IO
        this._of('/')

        // Якщо в опціях передали порт або існуючий HTTP-сервер, запускаємо інтеграцію
        if (serverOptions.port || serverOptions.server) {
            this.attach(serverOptions)
        }
    }

    /**
     * Ініціалізує та прив'язує сирий WebSocket-сервер до HTTP-інфраструктури.
     * @param {Object} options
     */
    attach(options) {
        this.wss = new WebSocketServer(options)

        // Ловимо кожне нове підключення на рівні веб-сокетів
        this.wss.on('connection', (ws, req) => {
            this._handleWebSocketConnection(ws, req)
        })
    }

    /**
     * Динамічне створення або отримання простору імен (Аналог `io.of('/chat')`).
     * @private
     */
    _of(name) {
        if (!this.namespaces.has(name)) {
            this.namespaces.set(name, new Namespace(name, this.AdapterClass))
        }
        return this.namespaces.get(name)
    }

    /**
     * Обробка вхідного з'єднання, парсинг URL та авторизація.
     * @private
     */
    _handleWebSocketConnection(ws, req) {
        // Парсимо URL, щоб підтримати query-параметри (наприклад, токени авторизації) та шлях простору імен
        const url = new URL(req.url, 'http://localhost')
        const pathname = url.pathname === '/' ? '/' : url.pathname

        // Шукаємо або створюємо потрібний простір імен
        const nsp = this.namespaces.get(pathname)
        if (!nsp) {
            // Якщо такого простору імен немає, закриваємо з'єднання
            ws.close()
            return
        }

        // Формуємо об'єкт handshake (заголовки, IP, токени з query string)
        const handshake = {
            headers: req.headers,
            address: req.socket.remoteAddress,
            query: Object.fromEntries(url.searchParams.entries()),
            token: url.searchParams.get('token') || req.headers['x-token'], // приклад зручного парсингу токена
        }

        // Загортаємо сирий ws у наш уніфікований ConnWrapper
        const connWrapper = new ConnWrapper(ws)

        // Передаємо загорнуте з'єднання в простір імен, де запустяться Middleware та створиться Socket
        nsp.addConnection(connWrapper, handshake)
    }

    // --- ПРОКСІ-МЕТОДИ ДЛЯ ДЕФОЛТНОГО ПРОСТОРУ ІМЕН '/' ---
    // Дозволяють писати `io.on` замість `io._of('/').on`

    on(event, callback) {
        return this._of('/').on(event, callback)
    }
    use(fn) {
        return this._of('/').use(fn)
    }
    to(room) {
        return this._of('/').to(room)
    }
    except(room) {
        return new this._of('/').except(room)
    }
    emit(event, ...args) {
        return this._of('/').emit(event, ...args)
    }
    of(name) {
        return this._of(name)
    }

    /**
     * Закриває сервер та очищує всі з'єднання.
     */
    close() {
        if (this.wss) this.wss.close()
        this.namespaces.forEach((nsp) => {
            nsp.sockets.forEach((socket) => socket.disconnect(true))
        })
    }
}
