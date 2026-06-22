import { EventEmitter } from 'events'
import { Socket } from './Socket.js'
import crypto from 'crypto'

export class Namespace extends EventEmitter {
    constructor(name, AdapterClass, serverId, logger = null) {
        super()

        this.name = name
        this.serverId = serverId
        this.logger = logger?.child?.({ component: 'Namespace', nsp: this.name }) ?? logger

        this.sockets = new Map() // id -> Socket
        this.adapter = new AdapterClass({ nsp: this, serverId: this.serverId })
        this.middlewares = []
    }

    /**
     * Реєстрація middleware
     */
    use(fn) {
        this.middlewares.push(fn)
        return this
    }

    // Внутрішній метод для послідовного виконання унікальних мідлварів неймспейсу
    async _runAuthorize(req) {
        if (this.middlewares.length === 0) return

        // 1. Створюємо "тимчасовий" сокет без реального ws-транспорту
        const id = crypto.randomUUID()
        const deps = { nsp: this, adapter: this.adapter, logger: this.logger }

        // Передаємо null замість ws, сокет просто згенерує handshake з req
        const socket = new Socket(id, null, deps, req)

        // 2. Запускаємо мідлвари, передаючи вже сформований socket (як у Socket.io! але без ws)
        const ctx = {
            socket,
            req,
            nsp: this,
        }

        for (const middleware of this.middlewares) {
            await new Promise((resolve, reject) => {
                middleware(ctx, (error) => {
                    if (error) reject(error)
                    else resolve()
                })
            })
        }

        // Повертаємо підготовлений та авторизований сокет
        return socket
    }

    /**
     * Ініціалізація нового з'єднання
     */
    async addConnection(ws, req, preAuthorizedSocket = null) {
        let socket = preAuthorizedSocket

        // Якщо мідлварів не було, сокет ще не створено — створюємо зараз
        if (!socket) {
            const id = crypto.randomUUID() //Math.random().toString(36).substring(2, 15)

            // Підготовка залежностей для Socket
            const deps = {
                nsp: this,
                adapter: this.adapter,
                logger: this.logger,
            }

            socket = new Socket(id, ws, deps, req)
        } else {
            // 🔥 КЛЮЧОВИЙ МОМЕНТ: Якщо сокет був створений у мідлварі,
            // прив'язуємо до нього реальний ws-транспорт та вмикаємо слухачі!
            socket.attachTransport(ws)
        }

        // Додаємо в реєстр після успішних middleware
        this.sockets.set(socket.id, socket)

        // Подія для зовнішнього використання
        super.emit('connection', socket)

        this.logger?.info?.(`Socket connected: ${socket.id}`)

        // // --- НАТИВНИЙ БУФЕР РАННІХ ПОВІДОМЛЕНЬ (вирішення Race Condition) ---
        // // Створюємо тимчасовий масив для повідомлень, які прилетять, поки крутиться Oracle
        // const earlyMessagesBuffer = []

        // // Перехоплюємо нативний обробник повідомлень сокету на час автентифікації
        // const temporaryMessageHandler = (rawMessage) => {
        //     this.logger?.debug?.(
        //         `[WS Buffer] Отримано раннє повідомлення до завершення мідлварів. Буферизуємо...`,
        //     )
        //     earlyMessagesBuffer.push(rawMessage)
        // }

        // // Вішаємо тимчасовий слухач на нативний ws-лаунчер
        // ws.on('message', temporaryMessageHandler)
        // // ----------------------------------------

        // try {
        //     // Послідовне виконання middleware
        //     const ctx = {
        //         socket,
        //         req,
        //         nsp: this,
        //     }

        //     for (const middleware of this.middlewares) {
        //         await new Promise((resolve, reject) => {
        //             middleware(ctx, (error) => {
        //                 if (error) reject(error)
        //                 else resolve()
        //             })
        //         })
        //     }

        //     // Знімаємо тимчасовий обробник, бо мідлвари успішно пройдено
        //     ws.off('message', temporaryMessageHandler)

        //     // Додаємо в реєстр після успішних middleware
        //     this.sockets.set(id, socket)

        //     // Подія для зовнішнього використання
        //     super.emit('connection', socket)

        //     this.logger?.info?.(`Socket connected: ${socket.id}`)

        //     // 🔥 НАЙВАЖЛИВІШИЙ КРОК: Прокручуємо буфер ранніх повідомлень!
        //     // Тепер, коли слухачі подій активовані, ми примусово змушуємо сокет обробити
        //     // команду 'join-api-room', яка прилетіла занадто рано.
        //     if (earlyMessagesBuffer.length > 0) {
        //         this.logger?.info?.(
        //             `[WS Buffer] Прокручуємо ${earlyMessagesBuffer.length} буферизованих повідомлень для сокету ${socket.id}`,
        //         )

        //         earlyMessagesBuffer.forEach((rawMessage) => {
        //             // Викликаємо внутрішній метод вашого класу Socket, який обробляє вхідні події.
        //             // Зазвичай у кастомних класах Socket він називається _handleMessage, handleMessage або onMessage
        //             // Передайте туди повідомлення у тому форматі, в якому ваш клас Socket його зазвичай приймає.
        //             if (typeof socket._handleMessage === 'function') {
        //                 socket._handleMessage(rawMessage)
        //             } else if (typeof socket.handleMessage === 'function') {
        //                 socket.handleMessage(rawMessage)
        //             } else {
        //                 // Якщо внутрішнього методу немає, можна просто земулювати подію на ws
        //                 ws.emit('message', rawMessage)
        //             }
        //         })
        //     }

        //     return socket
        // } catch (error) {
        //     // У разі помилки знімаємо тимчасовий слухач
        //     ws.off('message', temporaryMessageHandler)

        //     this.logger?.warn(`Connection rejected by middleware: ${error.message}`)

        //     // Відправляємо помилку і закриваємо
        //     socket._sendRaw({
        //         event: 'connect_error',
        //         data: [error.message || 'Authentication error'],
        //         metadata: {
        //             from: 'server',
        //             nsp: this.name,
        //             time: Date.now(),
        //         },
        //     })

        //     socket.disconnect()
        // }
    }

    /**
     * Видалення сокета з реєстру (викликається з Socket.js при onClose)
     */
    removeSocket(id) {
        this.sockets.delete(id)
    }

    /**
     * Отримує список об'єктів сокетів у всьому неймспейсі
     */
    async fetchSockets() {
        // Просто викликаємо метод адаптера без фільтрації по кімнатах
        return this.adapter.fetchSockets({})
    }

    /**
     * Глобальна відправка у весь Namespace: io.of('/').emit(...)
     */
    emit(event, args) {
        const packet = {
            event,
            data: args,
            metadata: {
                from: 'server',
                nsp: this.name,
                time: Date.now(),
            },
        }

        this.adapter.broadcast(packet, { rooms: new Set(), except: new Set() })
        return true
    }

    /**
     * Вибір кімнат для розсилки: io.to('r1').to('r2').emit(...)
     */
    to(room) {
        // Створюємо контекст запиту
        const ctx = {
            rooms: new Set(),
            except: new Set(),
            flags: {},
        }

        const addRoom = (r) => {
            if (Array.isArray(r)) r.forEach((item) => ctx.rooms.add(item))
            else ctx.rooms.add(r)
        }

        addRoom(room)

        // Повертаємо об'єкт-ланцюжок
        const chain = {
            to: (nextRoom) => {
                addRoom(nextRoom)
                return chain
            },
            in: (nextRoom) => {
                // аліас для to
                addRoom(nextRoom)
                return chain
            },
            except: (id) => {
                ctx.except.add(id)
                return chain
            },
            emit: (event, args) => {
                this.adapter.broadcast(
                    {
                        event,
                        data: args,
                        metadata: {
                            from: 'server',
                            nsp: this.name,
                            // Передаємо масив кімнат для прозорості
                            rooms: Array.from(ctx.rooms),
                            time: Date.now(),
                        },
                    },
                    {
                        rooms: ctx.rooms,
                    },
                )
            },
            fetchSockets: async () => {
                return this.adapter.fetchSockets({ rooms: ctx.rooms, except: ctx.except })
            },
        }

        return chain
    }

    in(room) {
        return this.to(room)
    }

    /**
     * Отримання кількості учасників у кімнаті
     */
    getRoomSize(room) {
        return this.adapter.getRoomSize(room)
    }

    /**
     * Закриття всього Namespace
     */
    async close() {
        // Копіюємо ключі, щоб уникнути проблем з ітерацією при видаленні
        // 1. Примусово відключаємо всі сокети (тут працює terminate(), це синхронно)
        const ids = Array.from(this.sockets.keys())
        for (const id of ids) {
            const socket = this.sockets.get(id)
            socket?.disconnect()
        }
        this.sockets.clear()
        this.middlewares = []
        this.removeAllListeners()

        // 2. Коректно закриваємо адаптер (наприклад, Redis)
        if (this.adapter && typeof this.adapter.close === 'function') {
            try {
                // Очікуємо закриття, якщо адаптер повертає Promise
                await this.adapter.close()
            } catch (err) {
                this.logger?.error?.(`Error closing adapter in namespace ${this.name}:`, err)
            }
            this.adapter = null
        }

        this.logger?.info?.(`Namespace ${this.name} closed`)
    }
}
