import { EventEmitter } from 'events'
import { Adapter } from './adapter.js'
import { Socket } from './socket.js'
import { SessionStore } from './session-store.js'
import { SessionRecovery } from './session-recovery.js'

const defaultSessionRecovery = new SessionRecovery(new SessionStore())

export class Namespace {
    constructor(
        name,
        adapterClass = Adapter,
        sessionRecovery = defaultSessionRecovery,
        heartbeatManager = null,
    ) {
        this.name = name
        this.emitter = new EventEmitter()
        this.sockets = new Map()
        this.adapter = new adapterClass(this)
        this.sessionRecovery = sessionRecovery
        this.heartbeatManager = heartbeatManager
        this.fns = []
    }

    on(ev, fn) {
        this.emitter.on(ev, fn)
        return this
    }
    to(room) {
        return new BroadcastOperator(this.adapter, new Set([room]))
    }
    emit(ev, ...args) {
        return new BroadcastOperator(this.adapter).emit(ev, ...args)
    }

    use(fn) {
        this.fns.push(fn)
        return this
    }

    async runMiddleware(socket) {
        let index = 0
        const run = async (idx) => {
            if (idx === this.fns.length) return
            return new Promise((resolve, reject) => {
                this.fns[idx](socket, (err) => {
                    if (err) return reject(err)
                    resolve(run(idx + 1))
                })
            })
        }
        await run(0)
    }

    async add(id, ws, handshake) {
        const socket = new Socket(id, this, ws, handshake, this.heartbeatManager)

        try {
            await this.runMiddleware(socket)

            const recovered = this.sessionRecovery.tryRecover(socket, handshake.query?.sid)

            this.sockets.set(id, socket)

            socket.on('disconnecting', () => {
                this.sessionRecovery.backup(socket)
            })

            this.emitter.emit('connection', socket, recovered)
            socket.packet({ type: 'session', sid: socket.sessionId })

            return socket
        } catch (err) {
            socket.packet({ type: 'error', data: err.message || 'Auth error' })
            socket.destroy('unauthorized')
        }
    }
}
