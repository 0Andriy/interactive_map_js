import crypto from 'crypto'

/**
 * Connection: індивідуальна обгортка сокета з унікальним ID.
 */
export class Connection {
    /**
     * @param {import('ws').WebSocket} ws
     * @param {import('./Namespace').Namespace} ns
     * @param {any|null} user
     * @param {import('../interfaces/ILogger').ILogger} logger
     * @param {string} ip
     */
    constructor(ws, ns, user, logger, ip) {
        this.id = crypto.randomUUID()
        this.ws = ws
        this.ns = ns
        this.user = user
        this.logger = logger

        // Метадані підключення
        this.meta = {
            ip,
            connectedAt: new Date(),
            isAlive: true,
            msgCount: 0,
            lastReset: Date.now(),
        }

        this.ws.on('message', (data) => {
            const now = Date.now()
            if (now - this.meta.lastReset > 1000) {
                this.meta.msgCount = 0
                this.meta.lastReset = now
            }
            if (++this.meta.msgCount > 50) return this.ws.terminate() // Rate limit
            this.ns.onMessage(this, data)
        })

        this.ws.on('pong', () => {
            this.meta.isAlive = true
            this.meta.lastSeen = new Date()
        })

        this.ws.on('close', () => this.destroy())
        this.ws.on('error', (err) => this.logger?.error(`Socket error ${this.id}`, err))
    }

    /**
     * @param {any} payload
     */
    send(payload) {
        if (this.ws.readyState === this.ws.OPEN) {
            this.ws.send(JSON.stringify(payload))
        }
    }

    async destroy() {
        this.logger?.info(`Socket ${this.id} disconnecting from ${this.ns.name}`)
        const rooms = await this.ns.state.getUserRooms(this.ns.name, this.id)
        for (const r of rooms) {
            const roomObj = this.ns.roomsMap.get(r)
            if (roomObj) {
                await roomObj.leave(this.id)
            }
            // await this.ns.state.removeUserFromRoom(this.ns.name, r, this.id)
        }
        this.ns.connections.delete(this.id)
        this.logger?.info(`Socket ${this.id} disconnected.`)
    }
}
