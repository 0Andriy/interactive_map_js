// src/room/RoomTask.js

/**
 * Клас, що представляє періодичне завдання, пов'язане з конкретною кімнатою.
 */
class RoomTask {
    /**
     * @param {string} id - Унікальний ID завдання.
     * @param {Function} callback - Функція, яка буде виконуватися.
     * @param {number} intervalMs - Інтервал виконання в мілісекундах.
     * @param {object} roomInfo - Об'єкт з інформацією про кімнату для передачі у callback.
     * @param {boolean} autoStart - Чи має завдання автоматично запускатися/зупинятися на основі кількості клієнтів.
     * @param {object} [logger=console] - Екземпляр логера. За замовчуванням використовується console.
     */
    constructor(id, callback, intervalMs, roomInfo, autoStart, logger = console) {
        if (!id || typeof callback !== 'function' || intervalMs <= 0 || !roomInfo) {
            throw new Error('RoomTask: Недійсні параметри конструктора.')
        }

        this.id = id
        this.callback = callback
        this.intervalMs = intervalMs
        this.roomInfo = roomInfo
        this.autoStart = autoStart
        this.logger = logger
        this.timer = null
        this.active = false

        this.logger.debug(
            `Завдання "${this.id}" для кімнати "${this.roomInfo.name}" ініціалізовано.`,
        )
    }

    /**
     * Запускає завдання.
     */
    start() {
        if (this.active) {
            this.logger.warn(`Завдання "${this.id}" вже активне.`)
            return
        }
        this.timer = setInterval(async () => {
            try {
                // Переконатися, що roomInfo оновлено перед кожним виконанням завдання,
                // особливо список клієнтів
                const updatedRoomInfo = await this.roomInfo.namespace
                    .getRoom(this.roomInfo.id)
                    .then((room) => (room ? room.getRoomInfo() : null))

                if (updatedRoomInfo) {
                    await this.callback(updatedRoomInfo)
                } else {
                    this.logger.warn(
                        `Завдання "${this.id}": Не вдалося оновити інформацію про кімнату ${this.roomInfo.id}. Пропускаємо виконання.`,
                    )
                }
            } catch (error) {
                this.logger.error(
                    `Помилка під час виконання завдання "${this.id}" у кімнаті "${this.roomInfo.name}": ${error.message}`,
                )
            }
        }, this.intervalMs)
        this.active = true
        this.logger.info(
            `Завдання "${this.id}" для кімнати "${this.roomInfo.name}" запущено з інтервалом ${this.intervalMs} мс.`,
        )
    }

    /**
     * Зупиняє завдання.
     */
    stop() {
        if (!this.active) {
            this.logger.warn(`Завдання "${this.id}" не активне.`)
            return
        }
        clearInterval(this.timer)
        this.timer = null
        this.active = false
        this.logger.info(`Завдання "${this.id}" для кімнати "${this.roomInfo.name}" зупинено.`)
    }

    /**
     * Перевіряє, чи завдання активне.
     * @returns {boolean}
     */
    isTaskActive() {
        return this.active
    }

    /**
     * Знищує завдання, зупиняючи його та очищаючи ресурси.
     */
    destroy() {
        this.stop()
        this.callback = null
        this.roomInfo = null
        this.logger.debug(`Завдання "${this.id}" для кімнати "${this.roomInfo.name}" знищено.`)
        this.logger = null
    }
}

export { RoomTask }
