import { EventEmitter } from 'events'
import crypto from 'crypto'

export class Socket extends EventEmitter {
    constructor(id, ws, deps = {}, req = {}) {
        super()

        // 1. Ідентифікація
        this.id = id || crypto.randomUUID()

        // 2. Системні посилання (з деструктуризації deps)
        this.nsp = deps.nsp
        this.adapter = deps.adapter
        this.logger =
            deps.logger?.child?.({
                component: 'Socket',
                socketId: this.id,
            }) ?? deps.logger

        // 3. Транспорт
        this.ws = ws

        // 4. Контекст користувача та дані рукостискання
        this.data = {}
        this.handshake = this._buildHandshake(req)

        // 5. Внутрішній стан для ланцюжків (Chaining)
        this._rooms = new Set()
        this._except = new Set()
        this._flags = {}
        this._clearChain()

        // Якщо транспорт передано одразу (немає мідлварів)
        if (this.ws) {
            // Автоматично додаємо сокет у власну кімнату (для приватних повідомлень)
            this.join(this.id)
            // Налаштування слухачів подій транспорту
            this._setupTransportListeners()
        }
    }

    // 🔥 Метод для динамічного підключення WebSocket після Upgrade
    attachTransport(ws) {
        this.ws = ws
        this.join(this.id)
        this._setupTransportListeners()
    }

    _buildHandshake(req) {
        // Гарантуємо, що об'єкт handshake завжди має стабільну структуру
        const { headers = {}, socket = {}, url = '/' } = req
        const host = headers.host || 'localhost'

        let query = {}
        let auth = {}
        let pathname = '/'

        try {
            const parsedUrl = new URL(url, `http://${host}`)
            pathname = parsedUrl.pathname
            query = Object.fromEntries(parsedUrl.searchParams)

            // Якщо клієнт передає auth-дані у форматі JSON через query string (як у socket.io)
            if (query.auth) {
                try {
                    auth = JSON.parse(query.auth)
                } catch {
                    // Якщо це не JSON, зберігаємо як сирий рядок
                    auth = {
                        raw: query.auth,
                    }
                }
            }
        } catch (err) {
            this.logger?.error?.('Failed to parse handshake URL', { url: url })
        }

        // 2. Визначення реальної IP-адреси клієнта з урахуванням проксі (Nginx, Cloudflare, AWS)
        const xForwardedFor = headers['x-forwarded-for']
        const remoteAddress = xForwardedFor
            ? xForwardedFor.split(',')[0].trim()
            : socket.remoteAddress || null

        // 3. Зручний розбір Cookies у формат об'єкта (ключ -> значення)
        let cookies = {}
        if (headers.cookie) {
            try {
                cookies = Object.fromEntries(
                    headers.cookie.split(';').map((cookie) => {
                        const [key, ...val] = cookie.split('=')
                        return [key.trim(), decodeURIComponent(val.join('='))]
                    }),
                )
            } catch (err) {
                this.logger?.warn?.('Failed to parse cookies', { error: err.message })
            }
        }

        // 4. Пошук токена авторизації у стандартних місцях
        // (Headers: Authorization Bearer, custom headers або query)
        const authHeader = headers['authorization'] || ''
        const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null

        // Повертаємо стабільну, розширену структуру
        return {
            // Сирі дані запиту
            headers,
            url,
            pathname,

            // Парсовані сутності
            query,
            cookies,
            auth: Object.keys(auth).length > 0 ? auth : bearerToken ? { token: bearerToken } : {},

            // Мережева інформація
            address: remoteAddress,
            xRealIp: headers['x-real-ip'] || null,
            cfConnectingIp: headers['cf-connecting-ip'] || null, // Для тих, хто за Cloudflare
            secure: !!(socket.encrypted || headers['x-forwarded-proto'] === 'https'),

            // Клієнтське оточення
            userAgent: headers['user-agent'] || null,
            origin: headers['origin'] || null,
            referer: headers['referer'] || null,
            acceptLanguage: headers['accept-language'] || null,

            // Метадані сесії
            issued: Date.now(),
        }
    }

    /**
     * Ініціалізація подій WebSocket
     */
    _setupTransportListeners() {
        this.ws.on('message', (rawData) => {
            // Любе повідомлення від клієнта підтверджує що він живий
            this.isAlive = true
            this._onMessage(rawData)
        })
        this.ws.on('close', (code, reason) => this._onClose(code, reason))
        this.ws.on('error', (error) => {
            this.logger?.error?.('Socket transport error', { error })
            this._onClose(1006, 'Transport error')
        })

        // Слухаємо системну подію "pong" від клієнта
        this.ws.on('pong', () => {
            this.isAlive = true
        })
    }

    /**
     * Відправка системного ping-кадра
     */
    ping() {
        if (this.ws.readyState === this.ws.constructor.OPEN) {
            this.ws.ping()
        }
    }

    /**
     * Обробка вхідних повідомлень від клієнта
     */
    _onMessage(rawData) {
        try {
            const packet = JSON.parse(rawData.toString())
            const { event, payload } = packet

            if (!event) {
                throw new Error('Packet format invalid: missing "event" property')
            }

            // Тут можна було б прогнати "пакетні мідлвари" (socket.use)
            // перед тим, як робити super.emit(event, payload)

            // Викликаємо подію на самому екземплярі сокета
            super.emit(event, payload)
        } catch (error) {
            this.logger?.warn?.('Received invalid packet', {
                errorMessage: error.message,
                errorStack: error.stack,
                data: rawData.toString(),
            })
        }
    }

    /**
     * Пряма відправка JSON-пакету в WebSocket
     */
    _sendRaw(packet) {
        if (this.ws && this.ws.readyState === this.ws.constructor.OPEN) {
            // WebSocket.OPEN - 1
            this.ws.send(JSON.stringify(packet))
        } else {
            this.logger?.debug?.('Try to send message to closed socket', { id: this.id })
        }
    }

    /**
     * Скидання параметрів ланцюжка (to, except, broadcast)
     */
    _clearChain() {
        this._rooms.clear()
        this._except.clear()
        this._flags = {
            broadcast: false,
            volatile: false,
            compress: true,
        }
    }

    // --- Методи управління кімнатами ---

    join(rooms) {
        this.adapter.addAll(this.id, rooms)
        return this
    }

    leave(rooms) {
        this.adapter.del(this.id, rooms)
        return this
    }

    /**
     * Перевірка чи є сокет учасником кімнати
     */
    hasRoom(room) {
        const socketRooms = this.adapter.sids.get(this.id)
        return socketRooms ? socketRooms.has(room) : false
    }

    /**
     * Повертає масив усіх кімнат сокета
     */
    get rooms() {
        const socketRooms = this.adapter.sids.get(this.id)
        return socketRooms ? Array.from(socketRooms) : []
    }

    // --- Методи побудови запитів (Chaining) ---

    /**
     * Вказує цільову кімнату для наступного emit
     */
    to(room) {
        this._rooms.add(room)
        return this
    }

    /**
     * Вказує сокети/кімнати, які треба виключити з розсилки
     */
    except(id) {
        this._except.add(id)
        return this
    }

    /**
     * Активує режим розсилки всім, крім себе
     */
    get broadcast() {
        this._flags.broadcast = true
        return this
    }

    /**
     * Основний метод відправки повідомлень (собі або в кімнати)
     */
    emit(event, args) {
        // Якщо це системна подія "disconnect" або подібні, працюємо як EventEmitter
        if (event === 'disconnect' || event === 'error') {
            return super.emit(event, args)
        }

        const packet = {
            event,
            data: args,
            metadata: {
                nsp: this.nsp.name,
                rooms: this._rooms.size > 0 ? Array.from(this._rooms) : [this.id],
                sender: {
                    id: this.id,
                    ...(this.data.user || {}), // Додаємо дані користувача, якщо вони є
                },
                time: Date.now(),
            },
        }

        // Визначаємо логіку відправки: адаптер (групи) чи пряма відправка (індивід)
        if (this._rooms.size > 0 || this._flags.broadcast) {
            // Якщо це broadcast, автоматично додаємо себе у виключення
            if (this._flags.broadcast) {
                this._except.add(this.id)
            }

            this.adapter.broadcast(packet, {
                rooms: new Set(this._rooms),
                except: new Set(this._except),
                flags: { ...this._flags },
            })
        } else {
            // Відправка конкретно цьому клієнту
            this._sendRaw(packet)
        }

        // Очищуємо стан для наступних викликів
        this._clearChain()
        return true
    }

    // --- Управління життєвим циклом ---

    /**
     * Внутрішній обробник закриття з'єднання
     */
    _onClose(code, reason) {
        // 1. Повідомляємо, що сокет "в процесі" відключення
        // В цей момент адаптер ще не чіпали!
        super.emit('disconnecting', reason)

        // Видаляємо сокет з усіх мап адаптера
        this.adapter.delAll(this.id)

        // Видаляємо сокет з Namespace
        this.nsp.removeSocket(this.id)

        // Повідомляємо програму про відключення
        super.emit('disconnect', reason.toString(), code)

        // Очищаємо всі підписки, щоб запобігти витоку пам'яті
        this.removeAllListeners()

        this.logger?.info?.(`Socket disconnected: ${this.id}`)
    }

    /**
     * Примусове закриття з'єднання
     */
    disconnect() {
        if (this.ws) {
            // 1. Примусово та миттєво рвемо з'єднання
            this.ws.terminate()
            this.ws.close()

            // 2. Очищаємо слухачі подій, щоб старий сокет не тримав об'єкт у пам'яті
            this.ws.removeAllListeners()

            // 3. Зануляємо посилання
            this.ws = null
        }

        return this
    }

    // ------------------------------------------------

    // // Реалізація broadcast (socket.to(....).emit(...))
    // to(room) {
    //     const hasAccess = this.isInRoom(room)

    //     return {
    //         emit: (event, ...args) => {
    //             if (!hasAccess) return

    //             const packet = {
    //                 event,
    //                 args,
    //                 metadata: _createMeta({ room }),
    //             }

    //             this.adapter.broadcast(packet, {
    //                 rooms: new Set([room]),
    //                 except: new Set([this.id]),
    //             })
    //         },
    //     }
    // }

    // _createMeta(overrides = {}) {
    //     const packet = {
    //         nsp: this.nsp.name,
    //         sender: {
    //             id: this.id,
    //             ...this.data?.user,
    //         },
    //         timestamp: Date.now(),
    //         serverId: this.adapter.serverId,
    //         ...overrides,
    //     }

    //     return packet
    // }

    // // Broadcast всім, крім себе, без вказання кімнати
    // get broadcast() {
    //     return {
    //         emit: (event, ...args) => {
    //             this.nsp.adapter.broadcast(
    //                 {
    //                     event,
    //                     args,
    //                     metadata: _createMeta(),
    //                 },
    //                 {
    //                     except: new Set([this.id]),
    //                 },
    //             )
    //         },
    //         to: (room) => {
    //             return {
    //                 emit: (event, ...args) => {
    //                     this.nsp.adapter.broadcast(
    //                         {
    //                             event,
    //                             args,
    //                             metadata: _createMeta({ room }),
    //                         },
    //                         {
    //                             except: new Set([this.id]),
    //                             rooms: new Set([room]),
    //                         },
    //                     )
    //                 },
    //             }
    //         },
    //     }
    // }
}
