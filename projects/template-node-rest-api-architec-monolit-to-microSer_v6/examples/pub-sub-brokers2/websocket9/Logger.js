export class Logger {
    constructor(context = 'Global') {
        this.context = context
    }

    info(message, meta = {}) {
        console.log(
            `[${new Date().toISOString()}] [INFO] [${this.context}] ${message}`,
            Object.keys(meta).length ? meta : '',
        )
    }

    debug(message, meta = {}) {
        console.debug(
            `[${new Date().toISOString()}] [DEBUG] [${this.context}] ${message}`,
            Object.keys(meta).length ? meta : '',
        )
    }

    error(message, error = {}) {
        console.error(`[${new Date().toISOString()}] [ERROR] [${this.context}] ${message}`, error)
    }

    child(context) {
        return new Logger(`${this.context}:${context}`)
    }
}
