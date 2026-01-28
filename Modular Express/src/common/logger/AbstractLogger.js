import { asyncLocalStorage } from '../utils/context.js'

export class AbstractLogger {
    constructor(level = 'info', staticContext = {}) {
        this.level = level
        this.staticContext = staticContext
        this.levels = { error: 0, warn: 1, info: 2, http: 3, debug: 4 }
    }

    _getContext() {
        const dynamicStore = asyncLocalStorage?.getStore() || {}
        // Пріоритет: Динамічний контекст (requestId) + Статичний (назва модуля)
        return { ...this.staticContext, ...dynamicStore }
    }

    // Методи, які мають бути у кожного логера
    info(msg, data) {
        this.log('info', msg, data)
    }
    error(msg, data) {
        this.log('error', msg, data)
    }
    warn(msg, data) {
        this.log('warn', msg, data)
    }
    http(msg, data) {
        this.log('http', msg, data)
    }
    debug(msg, data) {
        this.log('debug', msg, data)
    }

    log(level, msg, data) {
        throw new Error('Method "log" must be implemented')
    }

    // Метод для створення дочірнього логера
    child(additionalContext) {
        // Повертає новий екземпляр того ж класу, зберігаючи рівень
        return new this.constructor(this.level, { ...this.staticContext, ...additionalContext })
    }
}
