export class AckManager {
    static attach(socket, opts = {}) {
        let ackCounter = 0
        const pendingAcks = new Map()
        const timeoutMs = opts.timeout || 10000

        socket.emitWithAck = (event, ...args) => {
            return new Promise((resolve, reject) => {
                const id = ackCounter++
                const timeout = setTimeout(() => {
                    pendingAcks.delete(id)
                    reject(new Error(`Ack timeout for event: ${event}`))
                }, timeoutMs)

                pendingAcks.set(id, (...replyArgs) => {
                    clearTimeout(timeout)
                    resolve(replyArgs)
                })

                socket.sendRaw(JSON.stringify({ event, args, ackId: id }))
            })
        }

        socket.on('_raw_message', (raw) => {
            try {
                const { ackId, args } = JSON.parse(raw)
                if (ackId !== undefined && pendingAcks.has(ackId)) {
                    const callback = pendingAcks.get(ackId)
                    pendingAcks.delete(ackId)
                    callback(...args)
                }
            } catch {}
        })
    }
}
