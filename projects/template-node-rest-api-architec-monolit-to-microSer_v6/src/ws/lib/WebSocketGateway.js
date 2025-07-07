import { RoomsManager } from './RoomsManager.js'

/**
 * @typedef {import('../utils/logger.js').ILogger} ILogger
 */

/**
 * Керує кількома просторами імен, кожен з яких є окремими екземпляром RoomsManager.
 */
export class WebScoketGateway {
    /**
     * @private
     * @type {Map<string, RoomsManager>}
     */
    #namespaces = new Map()

    /**
     * @private
     * @type {ILogger}
     */
    #loger

    /**
     * @param {{logger?: ILogger}} [options={}]
     */
    constructor({ logger = console } = {}) {
        this.#loger = logger
    }

    /**
     * Повертає менеджер кімнат для вказаного простору імен
     * @param {string} nspName Назва простору імен (напр., '/' або '/chat' ...)
     * @returns {RoomsManager}
     */
    of(nspName) {
        if (!nspName || typeof nspName !== 'string') {
            nspName = '/' // Простір імен за замовчуванням
        }

        if (!this.#namespaces.has(nspName)) {
            this.#loger.info(`Створюємо новий простір імен: ${nspName}`)
            this.#namespaces.set(nspName, new RoomsManager({ logger: this.#loger }))
        }

        return this.#namespaces.get(nspName)
    }
}
