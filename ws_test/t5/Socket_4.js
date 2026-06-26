import { EventBus } from './EventBus.js'
import { BroadcastOperator } from './BroadcastOperator.js'

export class Socket {
    constructor(rawWs, id, nsp, handshake, logger) {
        this.rawWs = rawWs
        this.id = id
        this.nsp = nsp
        this.handshake = handshake
        this.logger = logger

        this.events = new EventBus()
        this.isAlive = true
        this.isVolatile = false
        this.ackCallbacks = new Map()
        this.ackCounter = 0

        this.#initListeners()
    }

    get rooms() {
        return this.nsp.adapter.sids.get(this.id) || new Set()
    }
    on(event, callback) {
        this.events.on(event, callback)
    }

    // Модифікований еміт: очищує таймаути, якщо вони були створені
    emit(event, data, ackCallback = null) {
        if (this.rawWs.readyState !== 1) return false
        const packet = { event, data }

        if (typeof ackCallback === 'function') {
            const ackId = ++this.ackCounter
            this.ackCallbacks.set(ackId, ackCallback)
            packet.ackId = ackId
        }

        if (this.isVolatile && this.rawWs.bufferedAmount > 0) {
            this.isVolatile = false
            return false
        }
        this.isVolatile = false
        this.rawWs.send(JSON.stringify(packet))
        return true
    }

    // ФІЧА: socket.timeout(ms).emit() — Повертає Promise та кидає помилку за таймаутом
    timeout(ms) {
        return {
            emit: (event, data) => {
                return new Promise((resolve, reject) => {
                    const ackId = ++this.ackCounter
                    const packet = { event, data, ackId }

                    // Ставимо запобіжник на випадок, якщо клієнт "залипнув"
                    const timer = setTimeout(() => {
                        if (this.ackCallbacks.has(ackId)) {
                            this.ackCallbacks.delete(ackId)
                            this.logger.warn(
                                `Acknowledgement для події "${event}" таймаутнувся після ${ms}мс`,
                                `Socket:${this.id}`,
                            )
                            reject(new Error(`operation timed out after ${ms} ms`))
                        }
                    }, ms)

                    // Реєструємо асинхронну відповідь
                    this.ackCallbacks.set(ackId, (resData) => {
                        clearTimeout(timer) // Обов'язково видаляємо таймер з ОЗП
                        resolve(resData)
                    })

                    if (this.rawWs.readyState === 1) {
                        this.rawWs.send(JSON.stringify(packet))
                    } else {
                        clearTimeout(timer)
                        this.ackCallbacks.delete(ackId)
                        reject(new Error('Socket connection is closed'))
                    }
                })
            },
        }
    }

    get broadcast() {
        return new BroadcastOperator(this.nsp.adapter, this.id)
    }
    get volatile() {
        return new BroadcastOperator(this.nsp.adapter, this.id).volatile
    }
    to(roomName) {
        return new BroadcastOperator(this.nsp.adapter, this.id).to(roomName)
    }
    in(roomName) {
        return this.to(roomName)
    }
    join(roomName) {
        this.nsp.adapter.addAll(this, [roomName])
    }
    leave(roomName) {
        this.nsp.adapter.del(this.id, roomName)
    }
    terminate() {
        this.rawWs.terminate()
    }

    #initListeners() {
        this.rawWs.on('pong', () => {
            this.isAlive = true
        })

        this.rawWs.on('message', (message) => {
            try {
                const parsed = JSON.parse(message)

                // Обробка вхідного Acknowledgement відповіді
                if (parsed.isAckResponse) {
                    const cb = this.ackCallbacks.get(parsed.ackId)
                    if (cb) {
                        cb(parsed.data)
                        this.ackCallbacks.delete(parsed.ackId)
                    }
                    return
                }

                // Обробка звичайної події, яку надіслав клієнт
                if (parsed.event) {
                    let respondFunc = null
                    if (parsed.ackId) {
                        respondFunc = (resData) => {
                            if (this.rawWs.readyState === 1) {
                                this.rawWs.send(
                                    JSON.stringify({
                                        isAckResponse: true,
                                        ackId: parsed.ackId,
                                        data: resData,
                                    }),
                                )
                            }
                        }
                    }
                    this.events.emit(parsed.event, parsed.data, respondFunc)
                }
            } catch (err) {
                this.logger.error(`Помилка: ${err.message}`, `Socket:${this.id}`)
            }
        })

        this.rawWs.on('close', (code, reason) => {
            // Очищуємо всі незавершені таймаути сокета при розриві
            this.ackCallbacks.clear()

            const activeRoomsBeforeCleanup = new Set(this.rooms)
            this.events.emit('disconnecting', activeRoomsBeforeCleanup)
            this.nsp.globalEvents.emit('disconnecting', {
                socket: this,
                rooms: activeRoomsBeforeCleanup,
            })

            this.nsp.adapter.delAll(this.id, this.nsp.serverOptions.gracePeriodMs, () => {
                this.events.emit('disconnect', { code, reason })
            })
        })
    }
}
