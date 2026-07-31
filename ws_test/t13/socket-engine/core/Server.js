import { Namespace } from './Namespace.js'
import { Socket } from './Socket.js'
import { EventBus } from './EventBus.js'
import { BroadcastOperator } from './BroadcastOperator.js'
import { Adapter } from './Adapter.js'

export class Server {
    constructor(options = {}) {
        this.logger = options.logger || console
        this.maxListeners = options.maxListeners || 20
        this.namespaces = new Map()

        // Автоматично створюємо дефолтний рутовий простір імен '/'
        this.sockets = this.createNamespace('/')
    }

    /**
     * Головна DI Фабрика для створення слабкозв'язаних просторів імен
     */
    createNamespace(name) {
        const nspName = String(name).startsWith('/') ? name : `/${name}`
        if (this.namespaces.has(nspName)) return this.namespaces.get(nspName)

        // 1. Ін'єктуємо ізольований EventBus для цього простору імен
        const nspBus = new EventBus({ logger: this.logger, maxListeners: this.maxListeners })

        // 2. Створюємо екземпляр простору імен (поки без адаптера, щоб уникнути circular link)
        const nspInstance = new Namespace({
            name: nspName,
            bus: nspBus,
            adapter: null, // Додамо на наступному кроці
            broadcastFactory: (selfId) =>
                new BroadcastOperator(
                    nspInstance.adapter,
                    new Set(),
                    selfId ? new Set([selfId]) : new Set(),
                    {},
                ),
        })

        // 3. Ін'єктуємо адаптер, передаючи йому посилання на nsp (Loose coupling)
        nspInstance.adapter = new Adapter(nspInstance)

        this.namespaces.set(nspName, nspInstance)
        return nspInstance
    }

    /**
     * Глобальні мідлварі для дефолтного Namespace
     */
    use(fn) {
        // У нашій DI архітектурі мідлварі можна зберігати на рівні шини подій nspBus
        // Або додати масив middleware безпосередньо у nspInstance, як ми робили раніше.
        // Для простоти прокинемо логіку через шину:
        this.sockets.bus.on('connection:attempt', fn)
        return this
    }

    /**
     * Аналог io.of('/chat')
     */
    of(name) {
        return this.createNamespace(name)
    }

    /**
     * Точка входу для сирих WebSocket з'єднань
     */
    handleConnection(rawSocket, upgradeReq) {
        const urlObj = new URL(upgradeReq.url, 'http://localhost')
        const nspName = this.namespaces.has(urlObj.pathname) ? urlObj.pathname : '/'
        const nsp = this.namespaces.get(nspName)

        const socketId = Math.random().toString(36).substring(2, 15)

        // 1. Створюємо ізольовану шину подій для сокета
        const socketBus = new EventBus({ logger: this.logger, maxListeners: this.maxListeners })

        // 2. Пов'язуємо системні івенти сокета з адаптером простору імен на рівні DI хабу.
        // Сам сокет нічого не знає про існування адаптера!
        socketBus.on('sys:room_join', ({ id, room }) => nsp.adapter.addAll(id, new Set([room])))
        socketBus.on('sys:room_leave', ({ id, room }) => nsp.adapter.del(id, room))

        // 3. Створюємо ін'єкційну фабрику розсилок для сокета
        const broadcastFactory = (selfId) => {
            return new BroadcastOperator(nsp.adapter, new Set(), new Set([selfId]), {})
        }

        // 4. Колбек для очищення при відключенні
        const onDisconnect = (socketInstance) => {
            nsp.remove(socketInstance)
        }

        // 5. Збираємо повністю слабкозв'язаний сокет
        const socket = new Socket(
            {
                id: socketId,
                rawSocket,
                bus: socketBus,
                broadcastFactory,
                onDisconnect,
            },
            upgradeReq,
        )

        // 6. Успішно пускаємо в простір імен
        nsp.add(socket)
    }
}
