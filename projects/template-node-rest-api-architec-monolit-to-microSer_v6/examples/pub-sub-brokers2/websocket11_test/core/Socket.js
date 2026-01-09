import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'

export class Socket extends EventEmitter {
    constructor(rawWs, nsp) {
        super()
        this.id = uuidv4()
        this.rawWs = rawWs
        this.nsp = nsp
        this.rooms = new Set()

        this.rawWs.on('message', (data) => this._onMessage(data))
        this.rawWs.on('close', () => this._onClose())
    }

    join(roomName) {
        this.rooms.add(roomName)
        this.nsp.adapter.addAll(this.id, [roomName])
        this.nsp._getOrCreateRoom(roomName)
        return this
    }

    leave(roomName) {
        this.rooms.delete(roomName)
        this.nsp.adapter.del(this.id, roomName)
        return this
    }

    to(roomName) {
        return {
            emit: (event, payload) => {
                this.nsp.adapter.broadcast(
                    { event, payload },
                    {
                        rooms: [roomName],
                        except: [this.id],
                    },
                )
            },
        }
    }

    emit(event, payload) {
        this._sendRaw({ event, payload })
    }

    _sendRaw(data) {
        if (this.rawWs.readyState === 1) {
            this.rawWs.send(JSON.stringify(data))
        }
    }

    _onMessage(data) {
        try {
            const { event, payload } = JSON.parse(data)
            super.emit(event, payload)
        } catch (e) {
            this.emit('error', 'Invalid Packet')
        }
    }

    _onClose() {
        this.nsp.adapter.delAll(this.id)
        super.emit('disconnect')
        this.removeAllListeners()
    }

    close() {
        this.rawWs.terminate()
    }
}
