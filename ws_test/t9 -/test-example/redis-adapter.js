import { Adapter } from './adapter.js'

export class RedisAdapter extends Adapter {
    constructor(nsp, pubClient, subClient) {
        super(nsp)
        this.pubClient = pubClient
        this.subClient = subClient
        this.channel = `socketio:${nsp.name}`

        this.subClient.subscribe(this.channel, (message) => {
            const { packet, opts } = JSON.parse(message)
            super.broadcast(packet, {
                rooms: new Set(opts.rooms),
                except: new Set(opts.except),
            })
        })
    }

    broadcast(packet, opts = {}) {
        const msg = JSON.stringify({
            packet,
            opts: {
                rooms: Array.from(opts.rooms || []),
                except: Array.from(opts.except || []),
            },
        })
        this.pubClient.publish(this.channel, msg)
    }
}
