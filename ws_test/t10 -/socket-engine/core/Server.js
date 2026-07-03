import { Namespace } from './Namespace.js'
import { InMemoryAdapter } from './InMemoryAdapter.js'

/**
 * Канонічний Server за стандартами Socket.IO.
 */
export class Server {
    /**
     * @param {object} [options={}] - Опції конфігурації.
     */
    constructor(options = {}) {
        this.nsps = new Map()
        this.options = options

        // За дефолтом використовуємо локальний InMemoryAdapter
        this._adapterCreator = (nsp) => new InMemoryAdapter(nsp)

        // Створюємо дефолтний простір імен
        this.of('/')
    }

    /**
     * Встановлює кастомний адаптер для ВСІХ просторів імен (Аналог io.adapter() у Socket.IO).
     * @param {Function} adapterFactory - Функція-фабрика, яка приймає nsp і повертає інстанс адаптера.
     * @returns {this}
     */
    adapter(adapterFactory) {
        if (typeof adapterFactory === 'function') {
            this._adapterCreator = adapterFactory

            // Оновлюємо адаптери для вже створених просторів імен
            for (const nsp of this.nsps.values()) {
                nsp.adapter = this._adapterCreator(nsp)
            }
        }
        return this
    }

    /**
     * Повертає існуючий або створює новий простір імен.
     */
    of(name) {
        if (typeof name !== 'string') return this.nsps.get('/')

        const cleanName = name.startsWith('/') ? name : `/${name}`
        let nsp = this.nsps.get(cleanName)

        if (!nsp) {
            nsp = new Namespace(cleanName, this.options.logger)
            // Автоматично ініціалізуємо поточний вибраний адаптер
            nsp.adapter = this._adapterCreator(nsp)
            this.nsps.set(cleanName, nsp)
        }
        return nsp
    }

    /** Синоніми для Chaining */
    to(room) {
        return this.of('/').to(room)
    }
    in(room) {
        return this.to(room)
    }
    use(fn) {
        return this.of('/').use(fn)
    }

    /** @internal */
    _handleConnection(rawConnection, socketId, namespaceName = '/') {
        const nsp = this.of(namespaceName)
        if (!nsp) return

        // Передаємо в сокет посилання на nsp (жорсткий зв'язок)
        const socket = new Socket(nsp, rawConnection, socketId)
        nsp.addSocket(socket)
        return socket
    }
}
