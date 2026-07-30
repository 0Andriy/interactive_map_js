import { EventBus } from './EventBus.js'
import { PacketPipeline } from './PacketPipeline.js'
import { BroadcastOperator } from './BroadcastOperator.js'
import { randomUUID } from 'crypto'

export class Socket extends EventBus {
    constructor(ws, nsp, handshake) {
        super()
        this.id = randomUUID()
        this.ws = ws
        this.nsp = nsp
        this.pipeline = new PacketPipeline()

        // Максимально повні дані про рукостискання та активність
        this.handshake = handshake
        this.connectedAt = new Date(handshake.issued)
        this.lastActivity = new Date()

        this.init()

        // Автоматично додаємо сокет у кімнату імені самого себе (для персональних емітів за socket.id)
        this.join(this.id)
    }

    // Швидкий доступ до проініціалізованого користувача
    get user() {
        return this.handshake.user
    }

    // Повертає список кімнат, в яких є поточний сокет (O(1) завдяки новому адаптеру)
    get rooms() {
        return this.nsp.adapter.sids.get(this.id) || new Set()
    }

    init() {
        this.ws.on('message', (data) => {
            this.lastActivity = new Date() // Оновлюємо таймштамп активності
            this.handleRaw(data)
        })
        this.ws.on('close', () => this.handleClose())
        this.ws.on('error', (err) => this.emit('error', err))
    }

    handleRaw(data) {
        try {
            const raw = data.toString()
            this.emit('_raw_message', raw)

            const packet = JSON.parse(raw)
            this.pipeline.execute(this, packet, (validatedPacket) => {
                this.processPacket(validatedPacket)
            })
        } catch (e) {
            this.emit('error', e)
        }
    }

    processPacket(packet) {
        const { event, args, ackId } = packet
        if (!event) return

        if (ackId !== undefined) {
            args.push((...replyArgs) => this.sendRaw(JSON.stringify({ ackId, args: replyArgs })))
        }
        this.emit(event, ...args)
    }

    use(fn) {
        this.pipeline.use(fn)
        return this
    }

    join(room) {
        this.nsp.adapter.addAll(this.id, [room])
    }

    leave(room) {
        this.nsp.adapter.del(this.id, room)
    }

    get broadcast() {
        return new BroadcastOperator(this.nsp.adapter, new Set(), new Set([this.id]))
    }

    to(room) {
        return this.broadcast.to(room)
    }

    emit(event, ...args) {
        if (event.startsWith('_') || ['disconnect', 'error'].includes(event)) {
            super.emit(event, ...args)
            return
        }
        this.sendRaw(JSON.stringify({ event, args }))
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
