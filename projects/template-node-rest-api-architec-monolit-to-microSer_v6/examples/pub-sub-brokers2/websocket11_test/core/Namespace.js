import { EventEmitter } from 'events'
import { Socket } from './Socket.js'
import { Room } from './Room.js'

export class Namespace extends EventEmitter {
    constructor(name, server) {
        super()
        this.name = name
        this.server = server
        this.sockets = new Map()
        this.rooms = new Map()
        this.middlewares = []
        this.adapter = new server.AdapterConstructor(this)
    }

    use(fn) {
        this.middlewares.push(fn)
        return this
    }

    // Fluent API розсилки
    to(room) {
        return this._createOperator({ rooms: [room] })
    }
    in(room) {
        return this.to(room)
    }
    except(id) {
        return this._createOperator({ except: [id] })
    }

    _createOperator(opts) {
        return {
            emit: (event, payload) => this.adapter.broadcast({ event, payload }, opts),
            to: (room) => {
                opts.rooms = opts.rooms || []
                opts.rooms.push(room)
                return this._createOperator(opts)
            },
        }
    }

    async _runMiddlewares(socket) {
        for (const fn of this.middlewares) {
            await new Promise((res, rej) => fn(socket, (e) => (e ? rej(e) : res())))
        }
    }

    async add(rawWs) {
        const socket = new Socket(rawWs, this)
        try {
            await this._runMiddlewares(socket)
            this.sockets.set(socket.id, socket)
            socket.on('disconnect', () => {
                this.sockets.delete(socket.id)
            })
            super.emit('connection', socket)
        } catch (err) {
            socket.emit('connect_error', { message: err.message })
            socket.close()
        }
    }

    _getOrCreateRoom(name) {
        if (!this.rooms.has(name)) this.rooms.set(name, new Room(name, this.adapter))
        return this.rooms.get(name)
    }

    emit(event, payload) {
        this.adapter.broadcast({ event, payload })
    }
}
