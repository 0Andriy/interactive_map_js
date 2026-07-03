import { HeartbeatStrategy } from './heartbeat-strategy.js'

export class GlobalHeartbeatManager extends HeartbeatStrategy {
    constructor(options = {}) {
        super()
        this.pingInterval = options.pingInterval || 25000
        this.pingTimeout = options.pingTimeout || 20000
        this.checkInterval = options.checkInterval || 5000

        this.sockets = new Set()
        this.ticker = null

        this.start()
    }

    start() {
        if (this.ticker) return

        this.ticker = setInterval(() => {
            const now = Date.now()

            for (const socket of this.sockets) {
                if (!socket.ws || socket.ws.readyState !== 1) {
                    this.unregister(socket)
                    continue
                }

                const timeSinceLastActivity = now - socket.lastActive

                if (timeSinceLastActivity >= this.pingInterval && !socket.isPingSent) {
                    socket.packet({ type: 'ping' })
                    socket.isPingSent = true
                }

                if (timeSinceLastActivity >= this.pingInterval + this.pingTimeout) {
                    this.unregister(socket)
                    socket.destroy('ping timeout')
                }
            }
        }, this.checkInterval)
    }

    register(socket) {
        socket.lastActive = Date.now()
        socket.isPingSent = false
        this.sockets.add(socket)
    }

    unregister(socket) {
        this.sockets.delete(socket)
    }

    handleActivity(socket) {
        socket.lastActive = Date.now()
        socket.isPingSent = false
    }

    destroy() {
        if (this.ticker) {
            clearInterval(this.ticker)
            this.ticker = null
        }
        this.sockets.clear()
    }
}
