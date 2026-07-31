export class Socket {
    /**
     * @param {object} dependencies - Об'єкт із впровадженими залежностями (DI)
     * @param {string} dependencies.id - Унікальний ID сокета
     * @param {object} dependencies.rawSocket - Сире WebSocket з'єднання
     * @param {object} dependencies.bus - Впроваджений екземпляр шини подій (EventBus)
     * @param {Function} dependencies.broadcastFactory - Фабрика для створення BroadcastOperator
     * @param {Function} dependencies.onDisconnect - Колбек, що викликається при видаленні сокета
     * @param {object} [upgradeReq=null] - Сирий HTTP запит для handshake
     */
    constructor({ id, rawSocket, bus, broadcastFactory, onDisconnect }, upgradeReq = null) {
        this.id = String(id)
        this.rawSocket = rawSocket
        this.rooms = new Set([this.id])
        this.handshake = this._buildHandshake(upgradeReq)

        // --- ВПРОВАДЖЕНІ ЗАЛЕЖНОСТІ (DI) ---
        this._bus = bus
        this._broadcastFactory = broadcastFactory
        this._onDisconnectCallback = onDisconnect

        // Прив'язуємо методи для збереження контексту
        this.on = this.on.bind(this)
        this.once = this.once.bind(this)
        this.off = this.off.bind(this)
        this.emit = this.emit.bind(this)

        this._initNetwork()
    }

    // --- ПРОКСІ-МЕТОДИ ДЛЯ ШИНИ ПОДІЙ (Слабка зв'язність) ---
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

    // --- ДИНАМІЧНИЙ BROADCAST ЧЕРЕЗ ФАБРИКУ ---
    // Сокет більше не зберігає всередині екземпляр оператора розсилки,
    // а генерує його «на льоту» через фабрику, передаючи лише свій id у винятки.
    to(room) {
        return this._broadcastFactory(this.id).to(room)
    }
    in(room) {
        return this.to(room)
    }
    except(roomOrSocketId) {
        return this._broadcastFactory(this.id).except(roomOrSocketId)
    }
    get volatile() {
        return this._broadcastFactory(this.id).volatile
    }
    get local() {
        return this._broadcastFactory(this.id).local
    }
    timeout(ms) {
        return this._broadcastFactory(this.id).timeout(ms)
    }

    emit(event, ...args) {
        if (typeof event !== 'string' || !event.trim()) return false

        let hasCallback = typeof args[args.length - 1] === 'function'
        let callback = hasCallback ? args.pop() : null

        const packet = {
            type: 'event',
            event: event,
            data: args.length === 1 ? args[0] : args.length > 1 ? args : null,
            meta: { id: Math.random().toString(36).substring(2, 11), timestamp: Date.now() },
        }

        if (callback) {
            this._sendWithAck(packet, callback)
        } else {
            this._sendRaw(packet)
        }
        return true
    }

    async join(room) {
        const roomName = String(room).trim()
        if (!roomName || this.rooms.has(roomName)) return
        this.rooms.add(roomName)
        this._bus.emit('sys:room_join', { id: this.id, room: roomName })
    }

    async leave(room) {
        const roomName = String(room).trim()
        if (roomName === this.id || !this.rooms.has(roomName)) return
        this.rooms.delete(roomName)
        this._bus.emit('sys:room_leave', { id: this.id, room: roomName })
    }

    disconnect() {
        if (typeof this.rawSocket.close === 'function') this.rawSocket.close()
        this._handleDisconnect('server namespace disconnect')
    }

    _initNetwork() {
        this.rawSocket.on('message', (rawData) => {
            try {
                const packet = JSON.parse(rawData)
                if (packet && packet.type === 'ack' && packet.meta?.ackId) {
                    this._bus.emit(packet.meta.ackId, packet.data)
                    return
                }
                if (packet && packet.type === 'event' && packet.event) {
                    this._bus.emit(packet.event, packet.data)
                }
            } catch (error) {
                this._bus.emit('error', error)
            }
        })

        this.rawSocket.on('close', (code) => {
            this._handleDisconnect(code === 1006 ? 'transport error' : 'transport close')
        })
    }

    _sendRaw(packet) {
        if (this.rawSocket.readyState === 1) {
            this.rawSocket.send(JSON.stringify(packet))
        }
    }

    _sendWithAck(packet, callback) {
        const ackId = `ack_${Math.random().toString(36).substring(2, 11)}`
        packet.meta.ackId = ackId
        this._bus.once(ackId, (res) => callback(res))
        this._sendRaw(packet)
    }

    _handleDisconnect(reason) {
        if (this.rooms.size === 0) return
        this._bus.emit('disconnecting', reason)

        // Викликаємо DI-колбек. Головний хаб сам видалить сокет звідусіль.
        this._onDisconnectCallback(this)

        this.rooms.clear()
        this._bus.emit('disconnect', reason)
        this._bus.removeAllListeners()
    }

    _buildHandshake(req) {
        if (!req)
            return {
                headers: {},
                time: new Date().toString(),
                address: '127.0.0.1',
                query: {},
                url: '/',
                auth: {},
            }
        let query = {}
        try {
            const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
            query = Object.fromEntries(urlObj.searchParams.entries())
        } catch (e) {}

        return {
            headers: req.headers || {},
            time: new Date().toString(),
            address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
            query,
            url: req.url || '/',
            auth: {},
        }
    }
}
