import { WebSocketServer } from 'ws'
import { Namespace } from './Namespace.js'
import { Socket } from './Socket.js'
import { InMemoryAdapter } from './InMemoryAdapter.js' // Імпортуємо для дефолтного стану
import url from 'url'

/**
 * Головний серверний керуючий клас (IoServer).
 * Керує життєвим циклом просторів імен (Namespaces), обробляє Upgrade-запити та HTTP-інтеграцію.
 * Оптимізований для Highload за допомогою глобального циклу лінивої перевірки активності сокетів.
 */
export class IoServer {
    /**
     * Створює екземпляр IoServer.
     * @param {Function} adapterFactory - Фабрична функція для створення адаптерів, наприклад: (name) => new InMemoryAdapter(name)
     * @param {any} logger - Головний екземпляр системного логера.
     * @param {object} [options={}] - Налаштування сервера.
     * @param {string} [options.path='/socket.io/'] - Базовий HTTP шлях, який слухає сокет-сервер.
     * @param {number} [options.gracePeriodMs=0] - Час утримання сокета в кімнатах після розриву (в мілісекундах).
     * @param {number} [options.pingIntervalMs=30000] - Інтервал перевірки клієнтів (Heartbeat) в мілісекундах.
     */
    constructor(adapterFactory = null, logger = null, options = {}) {
        // ЗА ЗAМОВЧУВАННЯМ: якщо фабрику не передали, автоматично створюємо InMemoryAdapter
        this.adapterFactory = adapterFactory || ((name) => new InMemoryAdapter(name))

        // ЗБЕРІГАЄМО ПОСИЛАННЯ НА КЛАС. Якщо не передано — беремо InMemoryAdapter
        this.AdapterClass = AdapterClass || InMemoryAdapter

        // Ініціалізація дочірнього логера за патерном
        this.logger = logger?.child?.({ component: '[WS IoServer]' }) ??
            logger ?? {
                info: () => {},
                warn: () => {},
                error: () => {},
                debug: () => {},
            }

        /** @type {Map<string, Namespace>} Зареєстровані простори імен: Name -> Namespace */
        this.namespaces = new Map()

        /** @type {Map<string, Socket>} Глобальний реєстр усіх активних фізичних сокетів на цій ноді: SocketId -> Socket */
        this.allSockets = new Map()

        this.options = {
            path: options.path || '/ws',
            gracePeriodMs: options.gracePeriodMs || 0,
            pingIntervalMs: options.pingIntervalMs || 30000,
            // Передаємо додаткові опції для адаптерів (наприклад, клієнти Redis або ліміти буфера)
            adapterOptions: options.adapterOptions || {},
        }

        this.wss = null
        this.heartbeatInterval = null

        // Автоматично створюємо дефолтний кореневий простір імен за специфікацією
        this.of('/')

        // Запускаємо єдиний високоефективний Highload Heartbeat
        // this.#startHighloadHeartbeat()
    }

    /**
     * Швидка розсилка (broadcast) події усім підключеним клієнтам КОРЕНЕВОГО ('/') простору імен.
     * @param {string} event - Назва події.
     * @param {any} data - Дані.
     */
    emit(event, data) {
        return this.of('/').emit(event, data)
    }

    /**
     * Націлює бродкаст у конкретну кімнату КОРЕНЕВОГО простору імен.
     * @param {string} roomName
     * @returns {import('./BroadcastOperator.js').BroadcastOperator}
     */
    to(roomName) {
        return this.of('/').to(roomName)
    }

    /**
     * Аліас для методу .to()
     * @param {string} roomName
     * @returns {import('./BroadcastOperator.js').BroadcastOperator}
     */
    in(roomName) {
        return this.to(roomName)
    }

    /**
     * Отримує існуючий простір імен або автоматично створює новий, якщо його немає.
     * @param {string} name - Назва простору (наприклад, '/chat' або '/admin').
     * @returns {Namespace}
     */
    of(name) {
        if (typeof name !== 'string') return this.of('/')

        // Переконуємося, що назва починається зі слешу
        const formattedName = name.startsWith('/') ? name : `/${name}`

        let nsp = this.namespaces.get(formattedName)
        if (!nsp) {
            // // ДИНАМІЧНО СТВОРЮЄМО ЕКЗЕМПЛЯР КЛАСУ АДAПТЕРА, передаючи туди nspName та опції
            // // Це повністю повторює поведінку Socket.io під капотом
            // const adapterInstance = new this.AdapterClass(
            //     formattedName,
            //     this.options.adapterOptions,
            // )

            const adapterInstance = this.adapterFactory(formattedName)
            nsp = new Namespace(formattedName, adapterInstance, this.options, this.logger)

            this.namespaces.set(formattedName, nsp)
            this.logger?.info?.(
                `Створено новий ізольований простір назв (Namespace): "${formattedName}"`,
            )
        }
        return nsp
    }

    /**
     * ! Є проблеми з стабільністю при різних параметрах
     * Високоефективний глобальний цикл перевірки активності сокетів (Lazy Evaluation).
     * Замінює тисячі індивідуальних setInterval на один централізований прохід.
     * @private
     */
    #startHighloadHeartbeat() {
        const checkIntervalMs = 20000 // Робимо зріз кожні т секунд

        // Максимальний час мовчанки, після якого клієнт вважається мертвим (30 секунд)
        const maxInactivityMs = this.options.pingIntervalMs || 60000

        // Повзунок надсилання пінгу: шлемо пінг, якщо клієнт мовчить довше ніж половина тайм-ауту (наприклад, > 15 сек)
        const pingThresholdMs = maxInactivityMs / 3

        this.logger?.info?.(
            `Запуск глобального Highload Heartbeat (інтервал перевірки: ${checkIntervalMs}мс, ліміт таймауту: ${maxInactivityMs}мс)`,
        )

        this.heartbeatInterval = setInterval(() => {
            const now = Date.now()

            for (const [socketId, socket] of this.allSockets.entries()) {
                const inactivityTime = now - socket.lastActivity

                // 1. Клієнт мовчить занадто довго — він "зомбі", негайно вбиваємо з'єднання
                if (inactivityTime >= maxInactivityMs) {
                    this.logger?.warn?.(
                        `Клієнт ${socketId} не виявляв активності ${inactivityTime}мс. Видалення.`,
                    )
                    this.allSockets.delete(socketId)
                    socket.terminate()
                    continue
                }

                // 2. Клієнт мовчить більше ніж половину дозволеного часу — штовхаємо його пінгом
                if (inactivityTime > pingThresholdMs) {
                    // 1 === OPEN
                    if (socket.rawWs.readyState === 1) {
                        if (typeof socket.rawWs.ping === 'function') {
                            socket.rawWs.ping() // Нативний легкий WebSocket Ping (ws бібл.)
                        } else {
                            // Фолбек для uWebSockets чи кастомних рушіїв — шлемо легкий системний пакет
                            socket.rawWs.send(JSON.stringify({ event: '__ping', data: {} }))
                        }
                    }
                }
            }
        }, checkIntervalMs).unref() // .unref() не тримає процес Node.js активним, якщо немає інших задач
    }

    // //
    // #startHighloadHeartbeat_2() {
    //     // Централізований метод очищення, щоб не дублювати код
    //     const cleanupSocket = (socketId, socket) => {
    //         this.allSockets.delete(socketId)
    //         try {
    //             socket.rawWs.terminate() // terminate() жорстко закриває TCP-з'єднання, не чекаючи закриття хендшейку
    //         } catch (err) {
    //             // Ігноруємо помилки, якщо сокет вже закритий на рівні ОС
    //         }
    //     }

    //     // У Socket.io стандарт: pingInterval = 25000, pingTimeout = 20000
    //     // Ми кожні 25 секунд перевіряємо стан сокетів
    //     const checkIntervalMs = this.options.pingIntervalMs || 25000

    //     this.logger?.info?.(
    //         `Запуск стабільного Heartbeat (інтервал перевірки та надсилання пінгу: ${checkIntervalMs}мс)`,
    //     )

    //     this.heartbeatInterval = setInterval(() => {
    //         // Перетворюємо в масив перед ітерацією, щоб уникнути багів видалення під час циклу
    //         const socketsArray = Array.from(this.allSockets.entries())

    //         for (const [socketId, socket] of socketsArray) {
    //             // 1 === OPEN
    //             if (socket.rawWs.readyState !== 1) {
    //                 cleanupSocket(socketId, socket)
    //                 continue
    //             }

    //             // Клієнт не відповів на ПОПЕРЕДНІЙ пінг за цілісіньких 25 секунд? Він мертвий.
    //             if (socket.isAlive === false) {
    //                 this.logger?.warn?.(
    //                     `Клієнт ${socketId} не відповів на тайм-аут пінгу. Видалення.`,
    //                 )
    //                 cleanupSocket(socketId, socket)
    //                 continue
    //             }

    //             // Скидаємо прапорець перед відправкою НОВОГО пінгу.
    //             // Тепер у клієнта є рівно 25 секунд (до наступного інтервалу), щоб повернути його в true.
    //             socket.isAlive = false

    //             if (typeof socket.rawWs.ping === 'function') {
    //                 socket.rawWs.ping()
    //             } else {
    //                 socket.rawWs.send(JSON.stringify({ event: '__ping', data: {} }))
    //             }
    //         }
    //     }, checkIntervalMs).unref()
    // }

    /**
     * Повертає повну системну статистику сервера по всіх просторах імен.
     * @async
     * @returns {Promise<object>} Об'єкт зі статистикою сокетів та кімнат.
     */
    async getStats() {
        const stats = {
            totalLocalSockets: this.allSockets.size,
            namespaces: {},
        }

        for (const [nspName, nsp] of this.namespaces.entries()) {
            // Отримуємо сокети/кімнати з адаптера (працює і для Memory, і для Redis кластера)
            const adapterRooms = await nsp.adapter.fetchSockets()

            const roomsData = {}
            let totalClusterSocketsInRooms = 0

            for (const [roomName, socketIds] of Object.entries(adapterRooms)) {
                // Ігноруємо дефолтні персональні кімнати сокетів (roomName === socketId),
                // щоб бачити лише ваші створені бізнес-кімнати (наприклад, "room_123")
                if (nsp.sockets.has(roomName)) continue

                roomsData[roomName] = {
                    count: socketIds.length, // Кількість учасників
                    socketIds: socketIds, // Масив конкретних ID
                }
                totalClusterSocketsInRooms += socketIds.length
            }

            stats.namespaces[nspName] = {
                localSocketsCount: nsp.sockets.size,
                activeBusinessRoomsCount: Object.keys(roomsData).length,
                rooms: roomsData,
            }
        }

        return stats
    }

    /**
     * Повертає повний список усіх підключених клієнтів по всіх просторах імен (працює в кластері).
     * @async
     * @returns {Promise<object>} Об'єкт з детальною інформацією про кожного клієнта.
     */
    async getAllConnectedClients() {
        const clientsReport = {
            totalGlobalSockets: 0,
            namespaces: {},
        }

        for (const [nspName, nsp] of this.namespaces.entries()) {
            // Отримуємо ВСІ сокети у цьому namespace по всьому Redis-кластеру
            const connectedSockets = await nsp.adapter.fetchSockets()

            const clientsList = connectedSockets.map((socket) => {
                // socket.rooms містить Set із кімнат, де перебуває клієнт
                const roomsArray = Array.from(socket.rooms)

                // Відфільтровуємо дефолтну кімнату сокета, щоб залишити тільки бізнес-кімнати
                const businessRooms = roomsArray.filter((room) => room !== socket.id)

                return {
                    id: socket.id,
                    handshake: {
                        address: socket.handshake.address,
                        query: socket.handshake.query,
                        headers: socket.handshake.headers,
                        time: socket.handshake.time,
                    },
                    // Сюди можна додати кастомні дані, які ви записували в socket.data
                    customData: socket.data || {},
                    rooms: businessRooms,
                }
            })

            clientsReport.namespaces[nspName] = {
                count: clientsList.length,
                clients: clientsList,
            }

            clientsReport.totalGlobalSockets += clientsList.length
        }

        return clientsReport
    }

    /**
     * Прикріплює WebSocket-шар до існуючого Node.js HTTP/HTTPS сервера та перехоплює 'upgrade' запити.
     * @param {import('http').Server} httpServer - Екземпляр Node.js HTTP сервера.
     */
    attach(httpServer) {
        this.wss = new WebSocketServer({ noServer: true })

        // Додаємо дефолтні налаштування CORS в конфіг опцій сервера, якщо їх не передали
        this.options.cors = this.options.cors || {
            origin: process.env.CORS_ORIGIN?.split(',') || ['*'], // '*' означає дозволити всім (для розробки)
            allowCredentials: true,
        }

        this.logger?.info?.(
            `WebSocket шар успішно прикріплено до HTTP сервера. Очікування Upgrade на: ${this.options.path}*`,
        )
        this.logger?.info?.(
            `CORS конфігурація Origins: ${JSON.stringify(this.options.cors.origin)}`,
        )

        httpServer.on('upgrade', (request, socket, head) => {
            // const parsedUrl = url.parse(request.url, true)
            const parsedUrl = new URL(request.url, 'http://localhost')
            const fullPath = parsedUrl.pathname || '/'

            // Нормалізуємо базовий шлях: переконуємося, що він закінчується на слеш (наприклад, "/ws/")
            const basePath = this.options.path.endsWith('/')
                ? this.options.path
                : `${this.options.path}/`

            // Якщо запит іде не за нашою базовою адресою, ігноруємо його
            if (!fullPath.startsWith(basePath) && fullPath !== this.options.path) return

            // --- КРИТИЧНИЙ ЗАХИСТ: CORS ВАЛІДАЦІЯ (CSWSH PROTECTION) ---
            const clientOrigin = request.headers['origin']
            const allowedOrigins = this.options.cors.origin

            // Якщо у конфігу немає зірочки '*', проводимо сувору перевірку Origin
            if (!allowedOrigins.includes('*')) {
                // Якщо Origin взагалі відсутній (наприклад, запит не з браузера) або його немає в білому списку
                if (!clientOrigin || !allowedOrigins.includes(clientOrigin)) {
                    this.logger?.warn?.(
                        `[CORS Blocked] Спроба підключення відхилена для Origin: "${clientOrigin || 'UNKNOWN'}" за шляхом: ${fullPath}`,
                    )

                    // Повертаємо офіційну HTTP помилку 403 Forbidden
                    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
                    socket.destroy()
                    return
                }
            }

            // Визначаємо назву простору імен: просто вирізаємо префікс basePath
            let nspName = '/'
            if (fullPath.startsWith(basePath)) {
                nspName = '/' + fullPath.substring(basePath.length)
            }

            // Запобігаємо подвійним слешам (наприклад, "//chat" -> "/chat")
            if (nspName.startsWith('//')) {
                nspName = nspName.substring(1)
            }

            // Якщо шлях закінчується на слеш (наприклад, "/chat/"), обрізаємо його для чистоти карти
            if (nspName.length > 1 && nspName.endsWith('/')) {
                nspName = nspName.slice(0, -1)
            }

            // ОПТИМІЗАЦІЯ: тепер використовуємо метод .of(), що дозволяє динамічно створювати Namespaces на льоту
            const nsp = this.of(nspName)

            // Передаємо сокет у внутрішній обробник ws для завершення WebSocket рукостискання (OPEN на клієнті в цей момент вже OK)
            this.wss.handleUpgrade(request, socket, head, (ws) => {
                // Генерація швидкого ID для сокета
                const socketId = `sid_${Math.random().toString(36).substring(2, 11)}`
                // const parsedUrl = url.parse(request.url, true)

                // 1. НАДІЙНЕ ВИЗНАЧЕННЯ IP (враховуємо проксі: Nginx, Cloudflare, HAProxy)
                const clientIp =
                    request.headers['cf-connecting-ip'] || // Cloudflare
                    request.headers['x-real-ip'] || // Nginx fastcgi / proxy
                    request.headers['x-forwarded-for']?.split(',')[0] || // Стандартний ланцюжок проксі
                    request.socket.remoteAddress // Пряме підключення

                // 2. МАКСИМАЛЬНЕ РОЗШИРЕННЯ HANDSHAKE (All-in-One)
                const handshake = {
                    /** @type {string} Унікальний ID самого процесу підключення */
                    handshakeId: `hid_${Math.random().toString(36).substring(2, 11)}`,

                    /** @type {string} ISO мітка часу спроби підключення */
                    time: new Date().toISOString(),

                    /** @type {number} Епоха мілісекунд для швидких математичних порівнянь */
                    issued: Date.now(),

                    /** @type {string} Розпарсений чистий IP-адрес клієнта */
                    address: clientIp,

                    /** @type {number} Локальний TCP порт клієнта */
                    remotePort: request.socket.remotePort,

                    /** @type {boolean} Чи використовується захищене TLS/SSL з'єднання */
                    secure: Boolean(
                        request.socket.encrypted ||
                        request.headers['x-forwarded-proto'] === 'https',
                    ),

                    /** @type {string} Сирий HTTP метод запиту (завжди GET для WebSocket Upgrade) */
                    method: request.method,

                    /** @type {string} Повний оригінальний URL запиту (наприклад, '/socket.io/?token=123') */
                    url: request.url,

                    /** @type {object} Повністю розпарсений Query-string у вигляді об'єкта ключових значень */
                    query: parsedUrl.query || Object.fromEntries(parsedUrl.searchParams) || {},

                    /** @type {object} Повний сирий об'єкт HTTP заголовків */
                    headers: request.headers,

                    // --- ШВИДКІ АЛІАСИ ДЛЯ НАЙПОПУЛЯРНІШИХ ДАНИХ (щоб не лізти глибоко в headers) ---

                    /** @type {string|null} Заголовок Authorization (наприклад, 'Bearer token_string') */
                    authHeader: request.headers['authorization'] || null,

                    /** @type {string|null} Сирий рядок кук для парсингу сесій */
                    cookieHeader: request.headers['cookie'] || null,

                    /** @type {string|null} Браузер / Платформа / Клієнтська операційна система */
                    userAgent: request.headers['user-agent'] || null,

                    /** @type {string|null} Звідки прийшов користувач (URL сторінки) */
                    referer: request.headers['referer'] || request.headers['referrer'] || null,

                    /** @type {string|null} Пріоритетні мови клієнта */
                    acceptLanguage: request.headers['accept-language'] || null,

                    /** @type {string|null} Хост, на який стукає клієнт (домен/порт) */
                    host: request.headers['host'] || null,

                    /** @type {string|null} Походження запиту (захист від CORS атак) */
                    origin: request.headers['origin'] || null,

                    // Параметри відновлення сесії
                    recoverSid: parsedUrl.searchParams.get('recover_sid') || null,
                    lastMsgId: parsedUrl.searchParams.get('last_msg_id') || null,
                }

                // Створюємо екземпляр нашого обгорнутого сокета
                const customSocket = new Socket(ws, socketId, nsp, handshake, this.logger)

                // Зберігаємо у глобальний реєстр цієї ноди
                this.allSockets.set(socketId, customSocket)

                // ВИПРАВЛЕНО ВИTIК ПАМ'ЯТІ: реєструємо глобальну подію видалення у межах всього сервера.
                // Коли сокет остаточно знищується адаптером після grace-періоду
                nsp.globalEvents.on('disconnect', ({ socketId: id }) => {
                    if (id === socketId) {
                        this.allSockets.delete(socketId)
                    }
                })

                // Передаємо сокет у простір імен для проходження middleware-авторизації
                nsp.addSocket(customSocket)
            })
        })
    }

    /**
     * Граціозно зупиняє сокет-сервер, відключає всіх клієнтів та очищає пам'ять.
     */
    close() {
        this.logger?.info?.('Ініційовано процедуру повного закриття сокет-сервера...')

        // Закриваємо всі простори імен (вони самі сповістять та відключать сокети без грації)
        for (const nsp of this.namespaces.values()) {
            nsp.close()
        }

        this.namespaces.clear()
        this.allSockets.clear()

        if (this.wss) {
            this.wss.close(() => {
                this.logger?.info?.('Внутрішній низькорівневий WebSocketServer повністю зупинено.')
            })
        }
    }
}
