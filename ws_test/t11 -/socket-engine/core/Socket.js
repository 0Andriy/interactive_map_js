import { EventBus } from './EventBus.js'
import { BroadcastOperator } from './BroadcastOperator.js'
import { randomUUID } from 'crypto'

export class Socket extends EventBus {
    constructor(ws, nsp) {
        super()
        this.id = randomUUID()
        this.ws = ws
        this.nsp = nsp
        this.rooms = new Set()

        this.init()
    }

    init() {
        this.ws.on('message', (data) => this.handleMessage(data))
        this.ws.on('close', () => this.handleClose())
        this.ws.on('error', (err) => this.emit('error', err))
    }

    handleMessage(data) {
        try {
            const raw = data.toString()
            // Подія для розширень (наприклад Heartbeat ловить свій ping)
            this.emit('_raw_message', raw)

            const { event, args, ackId } = JSON.parse(raw)

            if (event) {
                // Якщо є ackId, додаємо функцію зворотного виклику останнім аргументом
                if (ackId !== undefined) {
                    args.push((...replyArgs) =>
                        this.sendRaw(JSON.stringify({ ackId, args: replyArgs })),
                    )
                }
                this.emit(event, ...args)
            }
        } catch (e) {
            this.emit('error', e)
        }
    }

    join(room) {
        this.rooms.add(room)
        this.nsp.adapter.addAll(this.id, [room])
    }

    leave(room) {
        this.rooms.delete(room)
        this.nsp.adapter.del(this.id, room)
    }

    emit(event, ...args) {
        // Запобігаємо відправці внутрішніх системних подій на клієнт
        if (event.startsWith('_') || ['disconnect', 'error'].includes(event)) {
            super.emit(event, ...args)
            return
        }

        this.sendRaw(JSON.stringify({ event, args }))
    }

    // Повертає оператор, який автоматично ВИКЛЮЧАЄ поточний сокет із розсилки (як у socket.to)
    get broadcast() {
        return new BroadcastOperator(this.nsp.adapter, new Set(), new Set([this.id]))
    }

    sendRaw(stringData) {
        if (this.ws.readyState === this.ws.OPEN) {
            this.ws.send(stringData)
        }
    }

    handleClose() {
        this.nsp.adapter.delAll(this.id)
        this.emit('disconnect')
    }

    disconnect() {
        this.ws.close()
    }
}
