/**
 * @typedef {import('./Client.js').Client} Client
 * @typedef {import('./RoomsManager.js').RoomsManager} RoomsManager
 * @typedef {import('../utils/logger.js').ILogger} ILogger
 */

/**
 * @callback UpdateCallback
 * @param {string} roomName Назва кімнати.
 * @param {Set<Client>} activeClients Набір активних клієнтів у кімнаті.
 * @returns {Promise<any>} Дані для розсилки клієнтам.
 */

/**
 * @typedef {object} RoomOptions
 * @property {UpdateCallback} [updateCallback] Асинхрона функція для періодичного отримання даних.
 * @property {number} [updateIntervalMs=0] Інтервал оновлення в мілісекундах (мс).
 * @property {boolean} [runInitialUpdate=false] Чи запускати `updateCallback` одразу.
 */

/**
 * Клас, що інкапсолює логіку однієї WebSocket кімнати.
 */
export class Room {
    /**
     * @type {string}
     */
    name

    /**
     * @prive
     * @type {Set<string>}
     */
    #clients = new Set()

    /**
     * @private
     * @type {RoomOptions}
     */
    #options

    /**
     * @private
     * @type {RoomsManager}
     */
    #manager

    /**
     * @private
     * @type {ILogger}
     */
    #logger

    /**
     * @private
     * @type {NodeJS.Timeout|null}
     */
    #intervalId = null

    constructor(name, options, manager) {
        this.name = name
        this.#manager = manager
        this.#logger = manager.logger
        this.#options = {
            updateIntervalMs: 0,
            runInitialUpdate: false,
            ...options,
        }
        this.#logger.info(`Кімнату '${this.name}' створено.`)
    }

    /**
     * @param {string} clientId
     */
    addClient(clientId) {
        if (this.#clients.has(clientId)) return

        this.#clients.add(clientId)

        if (this.#clients.size === 1 && this.#options.updateIntervalMs > 0) {
            this.#startUpdates()
        }
    }

    /**
     * @param {string} clientId
     */
    removeClient(clientId) {
        if (this.#clients.delete(clientId) && this.#clients.size === 0) {
            this.#logger.info(`Кімната '${this.name}' стала порожньою.`)
            this.destroy()
        }
    }

    getClientCount() {
        return this.#clients.size || 0
    }

    /**
     * @param {*} payload Повідомлення для розсилки.
     * @param {object} [sendOptions] Опції для `ws.send`
     * @returns {number} Кількість одержувачів
     */
    broadcast(payload, sendOptions) {
        let sentCount = 0
        this.#clients.forEach((clientId) => {
            if (this.#manager.sendMessageToClient(clientId, payload, sendOptions)) {
                sentCount++
            }
        })
        return sentCount
    }

    destroy() {
        if (this.#intervalId) {
            clearInterval(this.#intervalId)
            this.#intervalId = null
            this.#logger.info(`Інтервал оновлень для кімнати '${this.name}' зупинено.`)
        }
        this.#manager.checkAndRemoveEmptyRoom(this.name)
    }

    /**
     * @private
     */
    async #startUpdates() {
        if (
            this.#intervalId ||
            !this.#options.updateCallback ||
            this.#options.updateIntervalMs <= 0
        )
            return

        const updateFn = async () => {
            if (this.#clients.size === 0) {
                this.destroy()
                return
            }

            try {
                const activeClients = new Set()
                this.#clients.forEach((id) => {
                    const client = this.#manager.getClientById(id)
                    if (client && client.ws.readyState === 1) activeClients.add(client)
                })

                if (activeClients.size === 0) return

                const data = await this.#options.updateCallback(this.name, activeClients)
                if (data !== null && data !== undefined) {
                    this.broadcast(JSON.stringify(data))
                }
            } catch (error) {
                this.#logger.error(`[Room:${this.name}] Помилка оновлення: ${error.message}`, error)
            }

            if (this.#options.runInitialUpdate) updateFn()

            this.#intervalId = setInterval(updateFn, this.#options.updateIntervalMs)
            this.#logger.info(`Інтервал оновлень для кімнати '${this.name}' запущено.`)
        }
    }
}
