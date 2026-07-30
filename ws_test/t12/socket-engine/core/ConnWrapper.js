import { MiniEventEmitter } from './MiniEventEmitter.js'

export class ConnWrapper extends MiniEventEmitter {
    /**
     * @param {Object} rawWs - Екземпляр WebSocket клієнта з 'ws'.
     */
    constructor(rawWs) {
        super()
        this.rawWs = rawWs
        this.id = Math.random().toString(36).substring(2, 15)

        /**
         * Прапорець життєздатності з'єднання для Heartbeat.
         * @type {boolean}
         */
        this.isAlive = true

        this._setupListeners()
    }

    /** @private */
    _setupListeners() {
        this.rawWs.on('message', (data) => {
            this.emitWithContext('message', this, [data.toString()])
        })

        this.rawWs.on('close', () => {
            this.emitWithContext('close', this)
        })

        this.rawWs.on('error', () => {
            this.emitWithContext('close', this)
        })

        // Коли від клієнта приходить подія 'pong', ми знаємо, що з'єднання живе
        this.rawWs.on('pong', () => {
            this.isAlive = true
        })
    }

    /**
     * Надсилає низькорівневий Ping фрейм клієнту.
     */
    ping() {
        if (this.rawWs.readyState === 1) {
            this.rawWs.ping()
        }
    }

    send(str) {
        if (this.rawWs.readyState === 1) {
            this.rawWs.send(str)
        }
    }

    close() {
        this.rawWs.close()
    }

    /**
     * Примусово розриває TCP сесію без очікування закриття хендшейку (найбільш безпечно при зависаннях)
     */
    terminate() {
        if (typeof this.rawWs.terminate === 'function') {
            this.rawWs.terminate()
        }
    }
}
