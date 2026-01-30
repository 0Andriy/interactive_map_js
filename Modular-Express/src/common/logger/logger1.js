import util from 'util'
import { asyncLocalStorage } from '../utils/context.js'

// Кольори для рівнів
const COLORS = {
    error: '\x1b[31m', // Червоний
    warn: '\x1b[33m', // Жовтий
    info: '\x1b[32m', // Зелений
    http: '\x1b[34m', // Синій
    debug: '\x1b[35m', // Фіолетовий
    reset: '\x1b[0m', // Скидання
    dim: '\x1b[90m', // Сірий
}

const LEVELS = { error: 0, warn: 1, info: 2, http: 3, debug: 4 }

class Logger {
    constructor(options = {}) {
        this.level = options.level || 'info'
        // "Двигун" логування (за замовчуванням console, але можна підмінити на winston)
        this.engine = options.engine || console
        this.staticContext = options.context || {}
    }

    /**
     * Отримує динамічний контекст (requestId, user) з AsyncLocalStorage + статичний контекст
     */
    _getFullContext() {
        const store = asyncLocalStorage?.getStore() || {}
        return { ...this.staticContext, ...store }
    }

    /**
     * Покращене форматування для консолі
     */
    _formatToConsole(level, message, context, data) {
        const ts = new Date().toISOString()
        const color = COLORS[level] || COLORS.reset
        const lvl = `${color}${level.toUpperCase().padEnd(5)}${COLORS.reset}`

        // Сірий колір для метаданих (ID запиту, користувач)
        const ctxStr = Object.keys(context).length
            ? ` ${COLORS.dim}[${JSON.stringify(context)}]${COLORS.reset}`
            : ''

        let result = `[${ts}] ${lvl}:${ctxStr} ${message}`

        // Використовуємо util.inspect для гарного відображення об'єктів (з кольорами)
        if (Object.keys(data).length) {
            const sanitizedData = data
            result += `\n${util.inspect(sanitizedData, {
                colors: true,
                depth: null,
                breakLength: 80,
            })}`
        }

        return result
    }

    /**
     * Внутрішній метод логування.
     * Саме тут ми вирішуємо, ЯК виводити лог.
     */
    _emit(level, message, data = {}) {
        if (LEVELS[level] > LEVELS[this.level]) return

        const context = this._getFullContext()
        const timestamp = new Date().toISOString()

        // Якщо двигун — це стандартний console
        if (this.engine === console) {
            console.log(this._formatToConsole(level, message, context, data))
        }
        // Якщо двигун — це, наприклад, Winston
        else {
            this.engine.log({ level, message, ...context, ...data })
        }
    }

    // Інтерфейс методів
    error(msg, data) {
        this._emit('error', msg, data)
    }
    warn(msg, data) {
        this._emit('warn', msg, data)
    }
    info(msg, data) {
        this._emit('info', msg, data)
    }
    http(msg, data) {
        this._emit('http', msg, data)
    }
    debug(msg, data) {
        this._emit('debug', msg, data)
    }

    child(childContext) {
        return new Logger({
            level: this.level,
            engine: this.engine,
            context: { ...this.staticContext, ...childContext },
        })
    }
}

// 1. Створюємо інстанс
export const logger = new Logger({ level: 'debug' })

// 2. ЯКЩО захочемо підмінити на Winston у майбутньому:
/*
import winston from 'winston';
const winstonInstance = winston.createLogger({...});
logger.engine = winstonInstance;
*/

export default logger
