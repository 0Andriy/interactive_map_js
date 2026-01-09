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

    /**
     * Ініціалізація нового з'єднання
     */
    async addConnection(ws, req) {
        const id = crypto.randomUUID() //Math.random().toString(36).substring(2, 15)

        // Підготовка залежностей для Socket
        const deps = {
            nsp: this,
            adapter: this.adapter,
            logger: this.logger,
        }

        const socket = new Socket(id, ws, deps, req)

        try {
            // Послідовне виконання middleware
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

            // Додаємо в реєстр після успішних middleware
            this.sockets.set(id, socket)

            // Подія для зовнішнього використання
            super.emit('connection', socket)

            this.logger?.info?.(`Socket connected: ${socket.id}`)

            return socket
        } catch (error) {
            this.logger?.warn(`Connection rejected by middleware: ${error.message}`)

            // Відправляємо помилку і закриваємо
            socket._sendRaw({
                event: 'connect_error',
                data: [error.message || 'Authentication error'],
                metadata: {
                    from: 'server',
                    nsp: this.name,
                    time: Date.now(),
                },
            })

            socket.disconnect()
        }
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
    close() {
        // Копіюємо ключі, щоб уникнути проблем з ітерацією при видаленні
        const ids = Array.from(this.sockets.keys())
        for (const id of ids) {
            const socket = this.sockets.get(id)
            socket?.disconnect()
        }

        this.sockets.clear()
        this.middlewares = []
        this.removeAllListeners()

        if (this.adapter && typeof this.adapter.close === 'function') {
            this.adapter.close()
            this.adapter = null
        }

        this.logger?.info?.(`Namespace ${this.name} closed`)
    }
}
