// src/core/Socket.js
import { EventBus } from './EventBus.js'
import { PacketPipeline } from './PacketPipeline.js'
import { BroadcastOperator } from './BroadcastOperator.js'
import { randomUUID } from 'crypto'

export class Socket extends EventBus {
    constructor(ws, nsp, handshake) {
        super()
        // 🔒 ПУБЛІЧНИЙ ID: Завжди новий для захисту від Session Hijacking
        this.id = crypto.randomUUID()
        // 🔑 СЕКРЕТНИЙ ID СЕСІЇ: Береться з відновленої або створюється новий
        this.sessionId = handshake.recoveredSessionId || crypto.randomUUID()

        this.ws = ws
        this.nsp = nsp
        this.pipeline = new PacketPipeline()

        this.handshake = handshake
        this.connectedAt = new Date(handshake.issued)
        this.lastActivity = new Date()

        // 1. Простий еміт ініціалізації
        super.emit('init')

        this.init()

        // 🎯 Автоматично додаємо сокет у власну кімнату за публічним id
        this.join(this.id)

        // 2. Простий еміт готовності
        super.emit('connected')
    }

    get user() {
        return this.handshake.user
    }

    get rooms() {
        return this.nsp.adapter.sids.get(this.id) || new Set()
    }

    init() {
        this.ws.on('message', (data) => {
            this.lastActivity = new Date()
            this.handleRaw(data)
        })
        this.ws.on('close', (code, reason) => this.handleClose(code, reason))
        this.ws.on('error', (err) => this.emit('error', err))
    }

    handleRaw(data) {
        try {
            const raw = data.toString()
            super.emit('_raw_message', raw)

            const packet = JSON.parse(raw)

            // 3. Простий еміт пакета події
            super.emit('packet', packet)

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
        if (
            event.startsWith('_') ||
            ['init', 'connected', 'packet', 'disconnecting', 'disconnect', 'error'].includes(event)
        ) {
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

    handleClose(code, reason) {
        // 4. Початок відключення (Кімнати ще живі)
        super.emit('disconnecting', reason, code)

        this.nsp.adapter.delAll(this.id)

        // 5. Повне відключення
        super.emit('disconnect', reason, code)
    }

    disconnect() {
        this.ws.close()
    }
}
