import { Namespace } from './Namespace.js'
import { Socket } from './Socket.js'
import { EventBus } from './EventBus.js'
import { BroadcastOperator } from './BroadcastOperator.js'
import { Adapter } from './Adapter.js'

export class Server {
    constructor(options = {}) {
        this.logger = options.logger || console
        this.maxListeners = options.maxListeners || 20

        // Глобальний реєстр просторів імен (наприклад: '/', '/chat', '/admin')
        this.namespaces = new Map()

        // Автоматично створюємо дефолтний простір імен
        this.sockets = this.createNamespace('/')
    }

    /**
     * DI Фабрика для створення нових ізольованих просторів імен
     */
    createNamespace(name) {
        const nspName = String(name).startsWith('/') ? name : `/${name}`
        if (this.namespaces.has(nspName)) return this.namespaces.get(nspName)

        // 1. Ін'єктуємо ізольовану шину подій для цього простору імен
        const nspBus = new EventBus({ logger: this.logger, maxListeners: this.maxListeners })

        // 2. Створюємо інстанс Namespace з фабрикою широкомовного оператора
        const nspInstance = new Namespace({
            name: nspName,
            bus: nspBus,
            adapter: null, // Додається нижче
            broadcastFactory: (selfId) =>
                new BroadcastOperator(
                    nspInstance.adapter,
                    new Set(),
                    selfId ? new Set([selfId]) : new Set(),
                    {},
                ),
        })

        // 3. Ін'єктуємо персональний InMemory-адаптер для цього простору імен
        nspInstance.adapter = new Adapter(nspInstance)

        this.namespaces.set(nspName, nspInstance)
        return nspInstance
    }

    of(name) {
        return this.createNamespace(name)
    }

    /**
     * ГОЛОВНИЙ ЦЕНТР МУЛЬТИПЛЕКСУВАННЯ (Точка входу для сирих WebSocket)
     */
    handleConnection(rawSocket, upgradeReq) {
        // Унікальний ID фізичного з'єднання клієнта (TCP сесії)
        const connectionId = Math.random().toString(36).substring(2, 15)

        // Мапа віртуальних сокетів цього користувача у різних просторах імен
        // Клієнт може бути одночасно в '/' та в '/chat' через один провід
        const clientSocketsInNamespaces = new Map() // nspName -> SocketInstance

        // --- ФАБРИКА СТВОРЕННЯ ВІРТУАЛЬНОГО СОКЕТА ДЛЯ КОНКРЕТНОГО NSP ---
        const initSocketInNamespace = (nspName, req) => {
            const nsp = this.namespaces.get(nspName)
            if (!nsp) return null

            const socketBus = new EventBus({ logger: this.logger, maxListeners: this.maxListeners })

            // Зв'язуємо івенти кімнат з адаптером конкретного nsp
            socketBus.on('sys:room_join', ({ id, room }) => nsp.adapter.addAll(id, new Set([room])))
            socketBus.on('sys:room_leave', ({ id, room }) => nsp.adapter.del(id, room))

            const broadcastFactory = (selfId) =>
                new BroadcastOperator(nsp.adapter, new Set(), new Set([selfId]), {})

            // Логіка очищення при відключенні з конкретного namespace
            const onDisconnect = (socketInstance) => {
                nsp.remove(socketInstance)
                clientSocketsInNamespaces.delete(nspName)
            }

            const socket = new Socket(
                {
                    id: connectionId, // ID сокета однаковий у всіх nsp для цього користувача, як у socket.io
                    rawSocket,
                    bus: socketBus,
                    broadcastFactory,
                    onDisconnect,
                },
                req,
            )

            // Перевизначаємо низькорівневий метод відправки, щоб автоматично підмішувати назву nsp у пакет
            const originalSendRaw = socket._sendRaw.bind(socket)
            socket._sendRaw = (packet) => {
                packet.nsp = nspName // Клієнт на фронтенді бачитиме, з якого nsp прилетіла подія
                originalSendRaw(packet)
            }

            nsp.add(socket)
            clientSocketsInNamespaces.set(nspName, socket)
            return socket
        }

        // 1. Автоматично підключаємо клієнта до базового рутового '/' простору імен
        initSocketInNamespace('/', upgradeReq)

        // 2. ДИСПЕТЧЕРИЗАЦІЯ ТРАФІКУ (Роутинг вхідних повідомлень)
        rawSocket.on('message', (rawData) => {
            try {
                const packet = JSON.parse(rawData)
                const targetNspName = packet.nsp || '/' // Якщо nsp немає, вважаємо дефолтним '/'

                // Клієнт хоче динамічно підключитися до нового простору імен (наприклад, через запит підключення)
                if (packet.type === 'connect_nsp' && packet.nsp) {
                    if (
                        this.namespaces.has(packet.nsp) &&
                        !clientSocketsInNamespaces.has(packet.nsp)
                    ) {
                        initSocketInNamespace(packet.nsp, upgradeReq)
                        rawSocket.send(
                            JSON.stringify({ type: 'connect_nsp_success', nsp: packet.nsp }),
                        )
                    }
                    return
                }

                // Шукаємо віртуальний сокет клієнта для цього простору імен
                const targetSocket = clientSocketsInNamespaces.get(targetNspName)
                if (!targetSocket) return

                // Прокидаємо пакети Ack або бізнес-подій у шину саме цього сокета
                if (packet.type === 'ack' && packet.meta?.ackId) {
                    targetSocket._bus.emit(packet.meta.ackId, packet.data)
                } else if (packet.type === 'event' && packet.event) {
                    targetSocket._bus.emit(packet.event, packet.data)
                }
            } catch (error) {
                this.logger.error(
                    `[Multiplex Error] Помилка маршутизації пакету клієнта ${connectionId}:`,
                    error,
                )
            }
        })

        // 3. ОБРОБКА ПОВНОГО РЕАЛЬНОГО ВІДКЛЮЧЕННЯ (TCP розрив)
        rawSocket.on('close', () => {
            // Коли клієнт закриває вкладку браузера, ми асинхронно відключаємо його з усіх просторів імен
            for (const [nspName, socketInstance] of clientSocketsInNamespaces.entries()) {
                socketInstance._handleDisconnect('transport close')
            }
            clientSocketsInNamespaces.clear()
        })
    }
}
