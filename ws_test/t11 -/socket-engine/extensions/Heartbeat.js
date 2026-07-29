export class Heartbeat {
    static attach(socket, opts = {}) {
        const interval = opts.interval || 25000
        const timeout = opts.timeout || 5000

        let timer
        let deathTimer

        const ping = () => {
            socket.sendRaw(JSON.stringify({ type: 'ping' }))
            deathTimer = setTimeout(() => socket.disconnect(), timeout)
        }

        const reset = () => {
            clearTimeout(timer)
            clearTimeout(deathTimer)
            timer = setInterval(ping, interval)
        }

        socket.on('_raw_message', (raw) => {
            try {
                const parsed = JSON.parse(raw)
                if (parsed.type === 'pong') reset()
            } catch {}
        })

        socket.on('disconnect', () => {
            clearTimeout(timer)
            clearTimeout(deathTimer)
        })

        reset()
    }
}
