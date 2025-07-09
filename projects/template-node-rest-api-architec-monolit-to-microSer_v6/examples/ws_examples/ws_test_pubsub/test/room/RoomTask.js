// src/room/RoomTask.js

/**
 * Представляє одне періодичне завдання для кімнати.
 * Інкапсулює логіку таймера та його життєвого циклу.
 */
class RoomTask {
    /**
     * @param {string} id - Унікальний ідентифікатор завдання.
     * @param {function(object): (Promise<any>|any)} callback - Асинхронна функція, яка буде викликана періодично.
     * Приймає об'єкт з інформацією про кімнату.
     * @param {number} interval - Інтервал виконання callback у мілісекундах.
     * @param {boolean} runImmediately - Чи викликати callback одразу при старті, а потім за інтервалом.
     * @param {object} roomContext - Об'єкт, що надає контекст кімнати (id, name, sendMessage, getClients, logger).
     * @param {object} logger - Об'єкт логера з методами info, warn, error, debug.
     */
    constructor(id, callback, interval, runImmediately, logger, roomContext) {
        if (!id || !callback || typeof interval !== 'number' || interval <= 0 || !roomContext) {
            throw new Error(
                'RoomTask потрібно ініціалізувати дійсним ID, функцією зворотного виклику, інтервалом та roomContext.',
            )
        }

        this.id = id
        this.callback = callback
        this.interval = interval
        this.runImmediately = runImmediately
        this.logger = logger
        this.roomContext = roomContext // Контекст кімнати
        this.intervalId = null
        this.isActive = false
        this.isProcessing = false // Додано для запобігання накладенню асинхронних викликів
    }

    /**
     * Виконує callback-функцію, передаючи їй контекст кімнати.
     * Запобігає одночасному виконанню кількох екземплярів одного callback'а.
     * @private
     */
    async #executeCallback() {
        if (this.isProcessing) {
            this.logger.warn(
                `Task "${this.id}" in room "${this.roomContext.name}": Previous execution still in progress. Skipping this turn.`,
            )
            return
        }

        this.isProcessing = true
        this.logger.debug(`Task "${this.id}" in room "${this.roomContext.name}": Running callback.`)

        try {
            // Передаємо об'єкт з інформацією та методами кімнати
            const result = await this.callback({
                roomId: this.roomContext.id,
                roomName: this.roomContext.name,
                clients: this.roomContext.getClients(), // Актуальний список клієнтів
                sendMessage: (message, options) => this.roomContext.sendMessage(message, options), // Метод для надсилання повідомлень
                logger: this.logger, // Логер завдання
            })

            if (result === null || result === undefined) {
                this.logger.debug(
                    `Task "${this.id}" in room "${this.roomContext.name}": Callback returned nothing.`,
                )
            }

            this.logger.debug(
                `Task "${this.id}" in room "${
                    this.roomContext.name
                }": Callback returned: ${JSON.stringify(result)}`,
            )
            // Тут можна додати логіку для обробки результату, якщо потрібно
        } catch (e) {
            this.logger.error(
                `Task "${this.id}" in room "${this.roomContext.name}": Callback error: ${e.message}. Stack: ${e.stack}`,
            )
        } finally {
            this.isProcessing = false
        }
    }

    /**
     * Перевіряє, чи активне завдання.
     * @returns {boolean}
     */
    isTaskActive() {
        return this.isActive
    }

    /**
     * Запускає періодичне виконання завдання.
     */
    start() {
        if (this.isActive) {
            this.logger.warn(
                `Task "${this.id}" in room "${this.roomContext.name}" is already active.`,
            )
            return
        }
        this.isActive = true

        if (this.runImmediately) {
            this.logger.debug(
                `Task "${this.id}" in room "${this.roomContext.name}": running immediately.`,
            )
            this.#executeCallback() // Викликаємо асинхронно
        }

        this.intervalId = setInterval(() => {
            this.#executeCallback() // Викликаємо асинхронно
        }, this.interval)

        this.logger.info(
            `Task "${this.id}" in room "${this.roomContext.name}" started with interval ${this.interval}ms.`,
        )
    }

    /**
     * Зупиняє періодичне виконання завдання.
     */
    stop() {
        if (!this.isActive) {
            this.logger.warn(`Task "${this.id}" in room "${this.roomContext.name}" is not active.`)
            return
        }
        clearInterval(this.intervalId)
        this.intervalId = null
        this.isActive = false
        this.isProcessing = false // Скидаємо прапор
        this.logger.info(`Task "${this.id}" in room "${this.roomContext.name}" stopped.`)
    }

    /**
     * Очищає всі ресурси, пов'язані із завданням (зупиняє таймер і обнуляє callback).
     */
    destroy() {
        this.stop()
        this.callback = null
        this.roomContext = null // Очищаємо посилання
        this.logger.debug(
            `Task "${this.id}" in room "${
                this.roomContext ? this.roomContext.name : 'unknown'
            }" destroyed.`,
        )
        this.logger = null // Знищуємо посилання на логер
    }

    /**
     * Перевіряє, чи активне завдання.
     * @returns {boolean}
     */
    isTaskActive() {
        return this.isActive
    }
}

export { RoomTask }
