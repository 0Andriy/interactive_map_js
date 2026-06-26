export class LoggerService {
    constructor(level = 'info', contextData = {}) {
        this.levels = { debug: 0, info: 1, warn: 2, error: 3 }
        this.currentLevel = this.levels[level] !== undefined ? this.levels[level] : 1
        this.contextData = contextData
        this.levelName = level
    }

    // Метод створення дочірнього логера для DI ізоляції компонентів
    child(extraContext = {}) {
        return new LoggerService(this.levelName, { ...this.contextData, ...extraContext })
    }

    #formatContext() {
        const parts = []
        if (this.contextData.component) parts.push(`comp:${this.contextData.component}`)
        if (this.contextData.nsp) parts.push(`nsp:${this.contextData.nsp}`)
        if (this.contextData.socketId) parts.push(`sid:${this.contextData.socketId}`)
        if (this.contextData.room) parts.push(`room:${this.contextData.room}`)
        return parts.length > 0 ? ` [\x1b[36m${parts.join('|')}\x1b[0m]` : ''
    }

    #log(level, color, message) {
        if (this.levels[level] < this.currentLevel) return
        const timestamp = new Date().toISOString()
        const ctxString = this.#formatContext()
        console.log(`${timestamp} [${color}${level.toUpperCase()}\x1b[0m]${ctxString}: ${message}`)
    }

    debug(msg) {
        this.#log('debug', '\x1b[35m', msg)
    }
    info(msg) {
        this.#log('info', '\x1b[32m', msg)
    }
    warn(msg) {
        this.#log('warn', '\x1b[33m', msg)
    }
    error(msg) {
        this.#log('error', '\x1b[31m', msg)
    }
}
