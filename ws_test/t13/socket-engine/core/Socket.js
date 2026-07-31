import { EventBus } from './EventBus.js'
import { BroadcastOperator } from './BroadcastOperator.js'

export class Socket {
    /**
     * @param {string} id - Унікальний ідентифікатор сокета.
     * @param {Namespace} nsp - Простір імен, до якого належить сокет.
     * @param {any} rawSocket - Сире WebSocket з'єднання (наприклад, від бібліотеки 'ws').
     * @param {any} [upgradeReq=null] - Сирий HTTP запит апгрейду сесії (для формування handshake).
     */
    constructor(id, nsp, rawSocket, upgradeReq = null) {
        // Системні інфраструктурні поля — повністю публічні (без префікса підкреслення)
        this.id = String(id)
        this.nsp = nsp
        this.server = nsp.server
        this.adapter = nsp.adapter
        this.rawSocket = rawSocket

        // Кожен сокет автоматично перебуває у власній персональній кімнаті зі своїм ID
        this.rooms = new Set([this.id])

        // --- ОБ'ЄКТ HANDSHAKE (Аналог Socket.io) ---
        // Збирає всю службову інформацію про клієнта та мережеве з'єднання
        this.handshake = this._buildHandshake(upgradeReq)

        // --- ВНУТРІШНЯ КОМПОЗИЦІЯ (Захищені інструменти) ---

        // Ізольована шина для вхідних бізнес-подій клієнта та системних івентів
        this._bus = new EventBus({
            logger: this.server.logger,
            maxListeners: this.server.maxListeners,
        })

        // Оператор широкомовної розсилки (ініціалізуємо із виключенням самого себе, як у socket.io)
        this._broadcastOperator = new BroadcastOperator(
            this.adapter,
            new Set(),
            new Set([this.id]),
            {},
        )

        // Прив'язуємо методи до поточного контексту, захищаючи від втрати `this`
        this.on = this.on.bind(this)
        this.once = this.once.bind(this)
        this.off = this.off.bind(this)
        this.emit = this.emit.bind(this)

        // Запуск прослуховування мережевого трафіку та життєвого циклу
        this._initNetwork()
    }

    // ==========================================
    // 1. СИНТАКСИС ШИНИ ПОДІЙ (EventEmitter / EventBus)
    // ==========================================

    on(event, callback) {
        this._bus.on(event, callback)
        return this
    }

    once(event, callback) {
        this._bus.once(event, callback)
        return this
    }

    off(event, callback) {
        this._bus.off(event, callback)
        return this
    }

    // Синоніми Node.js для розробників, які звикли до EventEmitter
    addListener(event, callback) {
        return this.on(event, callback)
    }
    removeListener(event, callback) {
        return this.off(event, callback)
    }

    // ==========================================
    // 2. СИНТАКСИС ЛАНЦЮЖКА РОЗСИЛКИ (Chaining)
    // ==========================================

    to(room) {
        return this._broadcastOperator.to(room)
    }

    in(room) {
        return this.to(room)
    }

    except(roomOrSocketId) {
        return this._broadcastOperator.except(roomOrSocketId)
    }

    get volatile() {
        return this._broadcastOperator.volatile
    }

    get local() {
        return this._broadcastOperator.local
    }

    timeout(ms) {
        return this._broadcastOperator.timeout(ms)
    }

    // ==========================================
    // 3. ПРЯМА ВІДПОВІДЬ КЛІЄНТУ (Direct Emit)
    // ==========================================

    /**
     * Відправка повідомлення СУТО цьому конкретному клієнту в мережу.
     */
    emit(event, ...args) {
        if (typeof event !== 'string' || !event.trim()) return false

        let hasCallback = typeof args[args.length - 1] === 'function'
        let callback = hasCallback ? args.pop() : null

        // Модернізована структура пакету (event + data + meta)
        const packet = {
            type: 'event',
            event: event,
            data: args.length === 1 ? args[0] : args.length > 1 ? args : null,
            meta: {
                id: Math.random().toString(36).substring(2, 11),
                timestamp: Date.now(),
            },
        }

        if (callback) {
            this._sendWithAck(packet, callback)
        } else {
            this._sendRaw(packet)
        }
        return true
    }

    // ==========================================
    // 4. КЕРУВАННЯ КІМНАТАМИ (Rooms Management)
    // ==========================================

    async join(room) {
        const roomName = String(room).trim()
        if (!roomName || this.rooms.has(roomName)) return

        this.rooms.add(roomName)
        await this.adapter.addAll(this.id, new Set([roomName]))
    }

    async leave(room) {
        const roomName = String(room).trim()
        // Забороняємо сокету виходити зі своєї базової персональної кімнати
        if (roomName === this.id || !this.rooms.has(roomName)) return

        this.rooms.delete(roomName)
        await this.adapter.del(this.id, roomName)
    }

    disconnect() {
        if (typeof this.rawSocket.close === 'function') {
            this.rawSocket.close()
        } else if (typeof this.rawSocket.terminate === 'function') {
            this.rawSocket.terminate()
        }
        this._handleDisconnect('server namespace disconnect')
    }

    // ==========================================
    // 5. НИЗЬКОРІВНЕВА МЕРЕЖЕВА СИСТЕМА ТА ЖИТТЄВИЙ ЦИКЛ
    // ==========================================

    _initNetwork() {
        this.rawSocket.on('message', (rawData) => {
            try {
                const packet = JSON.parse(rawData)

                // Обробка вхідних відповідей підтвердження доставки (Ack від клієнта)
                if (packet && packet.type === 'ack' && packet.meta?.ackId) {
                    this._bus.emit(packet.meta.ackId, packet.data)
                    return
                }

                // Стандартна бізнес-подія
                if (packet && packet.type === 'event' && packet.event) {
                    this._bus.emit(packet.event, packet.data)
                }
            } catch (error) {
                // ЖИТТЄВИЙ ЦИКЛ: подія помилки парсингу структури
                this._bus.emit('error', error)
                this.server.logger.error(
                    `[Socket Error] Помилка обробки даних від ${this.id}:`,
                    error,
                )
            }
        })

        // Слухаємо системні помилки з TCP/WebSocket рівня
        this.rawSocket.on('error', (error) => {
            this._bus.emit('error', error)
        })

        // Слухаємо подію закриття з'єднання на низькому рівні протоколу
        this.rawSocket.on('close', (code) => {
            // Конвертуємо коди закриття WebSocket у стандартні причини Socket.io
            let disconnectReason = 'transport close'
            if (code === 1006) disconnectReason = 'transport error'

            this._handleDisconnect(disconnectReason)
        })
    }

    /**
     * Потужний низькорівневий метод відправки сирого пакету в мережу.
     * Використовується також з боку Adapter.js для швидкого бродкасту.
     */
    _sendRaw(packet) {
        if (this.rawSocket.readyState === 1) {
            // 1 === OPEN у специфікації WebSockets
            this.rawSocket.send(JSON.stringify(packet))
        }
    }

    _sendWithAck(packet, callback) {
        const ackId = `ack_${Math.random().toString(36).substring(2, 11)}`
        packet.meta.ackId = ackId

        // Реєструємо тимчасову одноразову підписку на відповідь клієнта
        this._bus.once(ackId, (clientResponse) => {
            callback(clientResponse)
        })

        this._sendRaw(packet)
    }

    /**
     * Формує об'єкт handshake на основі сирого HTTP-запиту під час апгрейду
     */
    _buildHandshake(req) {
        if (!req) {
            return {
                headers: {},
                time: new Date().toString(),
                address: '127.0.0.1',
                query: {},
                url: '/',
                auth: {},
            }
        }

        // Парсимо URL та Query параметри безпечним шляхом
        let query = {}
        let url = req.url || '/'
        try {
            const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
            query = Object.fromEntries(urlObj.searchParams.entries())
        } catch (err) {
            // Фолбек, якщо URL пошкоджений
        }

        return {
            // Сирі HTTP-заголовки (для валідації Cookies або токенів авторизації)
            headers: req.headers || {},
            // Штамп часу створення рукостискання
            time: new Date().toString(),
            // IP-адреса клієнта (враховуючи проксі-сервери на кшталт Nginx/Cloudflare)
            address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
            // Розпарсені Query-параметри (наприклад, ?token=123 -> { token: '123' })
            query: query,
            // Сирий відносний рядок URL-адреси
            url: url,
            // Сховище для збереження кастомних бізнес-даних з middleware (наприклад, handshake.auth.user)
            auth: {},
        }
    }

    /**
     * Керує повним життєвим циклом деструктуризації сокета
     */
    _handleDisconnect(reason) {
        // Захист від подвійного виклику, якщо сесія вже вичищена
        if (!this.nsp.sockets.has(this.id)) return

        // 1. ЖИТТЄВИЙ ЦИКЛ: 'disconnecting'
        // На цьому етапі `this.rooms` ще повністю заповнений кімнатами клієнта!
        this._bus.emit('disconnecting', reason)

        // 2. Очищення інфраструктури: видаляємо сокет з мап простору імен та адаптера
        this.nsp.remove(this)

        // 3. Кімнати в адаптері очищені. Очищаємо локальний Set сокета (лишається пустим, як у socket.io)
        this.rooms.clear()

        // 4. ЖИТТЄВИЙ ЦИКЛ: 'disconnect'
        // Тут сокет повністю ізольований і готовий до збирання сміття (Garbage Collection)
        this._bus.emit('disconnect', reason)

        // 5. Поведінкове очищення слухачів для запобігання витокам пам'яті
        this._bus.removeAllListeners()
    }
}
