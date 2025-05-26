// logger.js

import winston from 'winston'

/**
 * Базовий "інтерфейс" логера.
 * У ES6 немає справжніх інтерфейсів, але клас з порожніми методами — поширена практика.
 */
class Logger {
    info(message, meta = {}) {}
    warn(message, meta = {}) {}
    error(message, meta = {}) {}
    debug(message, meta = {}) {}
}

/**
 * Реалізація логера через Winston.
 */
class WinstonLogger extends Logger {
    constructor() {
        super()
        this.logger = winston.createLogger({
            level: 'debug',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.printf(({ level, message, timestamp, ...meta }) => {
                    return `${timestamp} [${level.toUpperCase()}]: ${message} ${
                        Object.keys(meta).length ? JSON.stringify(meta) : ''
                    }`
                }),
            ),
            transports: [new winston.transports.Console()],
        })
    }

    info(message, meta = {}) {
        this.logger.info(message, meta)
    }

    warn(message, meta = {}) {
        this.logger.warn(message, meta)
    }

    error(message, meta = {}) {
        this.logger.error(message, meta)
    }

    debug(message, meta = {}) {
        this.logger.debug(message, meta)
    }
}

// === Єдина точка входу ===
// Якщо потрібно буде змінити реалізацію (наприклад, на Pino), просто змінюєш цю строку.
const logger = new WinstonLogger()

// === Приклади використання ===
// Це може бути в іншому файлі, але тут все разом для простоти демонстрації.

logger.info('Сервер стартував', { port: 3000 })
logger.debug('Отримано запит', { method: 'GET', url: '/api/user' })
logger.warn('Відсутній токен авторизації', { headers: { authorization: null } })
logger.error('Помилка бази даних', { code: 'DB_CONN_ERR', retry: true })

// === Експорт логера для використання в інших файлах ===
export default logger
