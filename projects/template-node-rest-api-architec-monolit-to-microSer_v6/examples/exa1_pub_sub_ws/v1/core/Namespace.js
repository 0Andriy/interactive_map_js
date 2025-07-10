import { Room } from './Room.js'
import { TaskScheduler } from './TaskScheduler.js'
import { v4 as uuidv4 } from 'uuid'

/**
 * @class Namespace
 * @description Представляє простір імен, що містить кімнати та глобальні задачі.
 */
class Namespace {
    #id
    #rooms = new Map() // Map<roomId, Room>
    #globalTaskScheduler // Планувальник для глобальних задач простору імен
    #logger
    #roomConfigDefaults

    /**
     * @param {string} id - Унікальний ідентифікатор простору імен (наприклад, "chat", "game").
     * @param {ILogger} logger - Екземпляр логера.
     * @param {object} [roomConfigDefaults={}] - Дефолтні конфігурації для кімнат в цьому просторі імен.
     */
    constructor(id, logger, roomConfigDefaults = {}) {
        this.#id = id
        this.#logger = logger
        this.#globalTaskScheduler = new TaskScheduler(logger)
        this.#roomConfigDefaults = roomConfigDefaults
        this.#logger.log(`Namespace '${this.#id}' created.`)
    }

    get id() {
        return this.#id
    }

    /**
     * Створює або повертає існуючу кімнату.
     * @param {string} roomId - Ідентифікатор кімнати.
     * @param {object} [config={}] - Додаткова конфігурація для кімнати.
     * @returns {Room}
     */
    getOrCreateRoom(roomId, config = {}) {
        if (!this.#rooms.has(roomId)) {
            const room = new Room(
                roomId,
                this.#id,
                { ...this.#roomConfigDefaults, ...config },
                this.#logger,
                this.#globalTaskScheduler, // Задачі кімнат виконуються в глобальному планувальнику
            )
            this.#rooms.set(roomId, room)
            // Підписуємося на подію, коли кімната готова до видалення
            room.emit = (eventName, ...args) => {
                if (eventName === 'roomEmptyAndReadyForRemoval' && this.#rooms.has(args[0])) {
                    this.removeRoom(args[0])
                }
            }
            this.#logger.log(`Room '${roomId}' created in namespace '${this.#id}'.`)
        }
        return this.#rooms.get(roomId)
    }

    /**
     * Отримує кімнату за її ID.
     * @param {string} roomId - Ідентифікатор кімнати.
     * @returns {Room|undefined}
     */
    getRoom(roomId) {
        return this.#rooms.get(roomId)
    }

    /**
     * Видаляє кімнату.
     * @param {string} roomId - Ідентифікатор кімнати.
     * @returns {boolean} True, якщо кімната була видалена.
     */
    removeRoom(roomId) {
        const room = this.#rooms.get(roomId)
        if (room) {
            room.destroy() // Очистити ресурси кімнати
            this.#rooms.delete(roomId)
            this.#logger.log(`Room '${roomId}' removed from namespace '${this.#id}'.`)
            return true
        }
        return false
    }

    /**
     * Реєструє глобальну періодичну задачу для цього простору імен.
     * Ці задачі працюють незалежно від кількості користувачів у кімнатах,
     * але можуть мати власну логіку перевірки.
     * @param {string} taskId - Унікальний ідентифікатор задачі.
     * @param {object} config - Конфігурація задачі (intervalMs, runOnActivation).
     * @param {function(any): any} taskFn - Функція, яка буде виконуватися.
     * @param {object} [params={}] - Параметри для taskFn.
     */
    addGlobalScheduledTask(taskId, config, taskFn, params = {}) {
        const uniqueTaskId = `global_${this.#id}_${taskId}` // Запобігти конфліктам ID
        this.#globalTaskScheduler.scheduleTask(uniqueTaskId, config, taskFn, params)
        this.#logger.log(`Global task '${taskId}' scheduled for namespace '${this.#id}'.`)
    }

    /**
     * Зупиняє глобальну періодичну задачу.
     * @param {string} taskId - Ідентифікатор задачі.
     */
    stopGlobalScheduledTask(taskId) {
        const uniqueTaskId = `global_${this.#id}_${taskId}`
        this.#globalTaskScheduler.stopTask(uniqueTaskId)
    }

    /**
     * Очищає всі ресурси простору імен (зупиняє задачі, видаляє кімнати).
     */
    destroy() {
        this.#globalTaskScheduler.stopAllTasks()
        this.#rooms.forEach((room) => room.destroy())
        this.#rooms.clear()
        this.#logger.log(`Namespace '${this.#id}' destroyed.`)
    }
}

export { Namespace }
