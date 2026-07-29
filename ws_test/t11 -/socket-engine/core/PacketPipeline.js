/**
 * Клас для побудови конвеєрів (цепочок) обробки вхідних пакетів.
 */
export class PacketPipeline {
    constructor() {
        this.middlewares = []
    }

    // Додає крок (middleware) у цепочку
    use(fn) {
        this.middlewares.push(fn)
        return this
    }

    // Запускає виконання цепочки для конкретного пакета
    execute(socket, packet, callback) {
        let index = 0

        const next = (err) => {
            if (err) {
                socket.emit('error', err.message || err)
                return
            }

            const middleware = this.middlewares[index++]
            if (middleware) {
                try {
                    middleware(socket, packet, next)
                } catch (e) {
                    next(e)
                }
            } else {
                callback(packet)
            }
        }

        next()
    }
}
