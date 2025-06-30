import BaseLogger from '../BaseLogger.js'
import winston from 'winston'

/**
 * Winston логер
 */
export default class WinstonLogger extends BaseLogger {
    /**
     * @param {Object} deps
     * @param {Object} deps.config - конфіг winston
     */
    constructor({ config }) {
        super()
        this.logger = winston.createLogger(config)
    }

    log(level, message, meta) {
        this.logger.log(level, message, meta)
    }
}
