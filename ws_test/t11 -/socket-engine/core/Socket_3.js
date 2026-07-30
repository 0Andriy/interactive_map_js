// src/core/Socket.js
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

        this.handshake = handshake
        this.connectedAt = new Date(handshake.issued)
        this.lastActivity = new Date()

        // 1. ХУК: Ініціалізація об'єкта сокета
        this.emitLifecycle('init')

        this.init()

        // Автоматично додаємо сокет у власну кімнату
        this.join(this.id)

        // 2. ХУК: Сокет повністю готовий до роботи
        this.emitLifecycle('connected')
    }

    get user() {
        return this.handshake.user
    }

    get rooms() {
        return this.nsp.adapter.sids.get(this.id) || new Set()
    }

    // Хелпер для стандартизації системних івентів
    emitLifecycle(stage, data = {}) {
        this.emit(`_lifecycle:${stage}`, {
            socket: this,
            timestamp: new Date(),
            ...data,
        })
    }

    init() {
        this.ws.on('message', (data) => {
            this.lastActivity = new Date()
            this.handleRaw(data)
        })

        // Слухаємо подію закриття нативного WS
        this.ws.on('close', (code, reason) => this.handleClose(code, reason))
        this.ws.on('error', (err) => this.emit('error', err))
    }

    handleRaw(data) {
        try {
            const raw = data.toString()
            this.emit('_raw_message', raw)

            const packet = JSON.parse(raw)

            // 3. ХУК: Отримано пакет події
            this.emitLifecycle('packet', { packet })

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

    // Обробка процесу відключення
    handleClose(code, reason) {
        // 4. КРИТИЧНИЙ ХУК: Початок відключення (disconnecting)
        // Тут сокет ЩЕ Є в усіх кімнатах, адаптер його не видалив
        this.emitLifecycle('disconnecting', { code, reason, activeRooms: Array.from(this.rooms) })

        // Стандартна бізнес-подія для зворотної сумісності з socket.io
        super.emit('disconnecting', reason)

        // Очищення кімнат в адаптері
        this.nsp.adapter.delAll(this.id)

        // 5. ХУК: Повне відключення (disconnected)
        this.emitLifecycle('disconnected', { code, reason })
        super.emit('disconnect', reason)
    }

    disconnect() {
        // Виклик методу disconnect вручну також запустить handleClose через подію 'close' нативного ws
        this.ws.close()
    }
}
