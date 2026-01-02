/**
 * Інтерфейс адаптера для планувальника завдань.
 * Використовується як базовий клас для реалізації конкретних стратегій планування.
 * @interface
 */
export class ISchedulerAdapter {
    /**
     * Запланувати виконання завдання.
     * @param {string} taskId - Унікальний ідентифікатор завдання.
     * @param {() => Promise<void> | void} executeFn - Функція, що буде виконана.
     * @param {Record<string, any>} config - Конфігурація розкладу (наприклад, cron-вираз або інтервал).
     * @returns {Promise<void>}
     * @abstract
     */
    async schedule(taskId, executeFn, config) {
        throw new Error('Method "schedule" must be implemented')
    }

    /**
     * Зупинити конкретне завдання за його ідентифікатором.
     * @param {string} taskId - Ідентифікатор завдання для зупинки.
     * @returns {Promise<void>}
     * @abstract
     */
    async stop(taskId) {
        throw new Error('Method "stop" must be implemented')
    }

    /**
     * Зупинити всі активні завдання.
     * @returns {Promise<void>}
     * @abstract
     */
    async stopAll() {
        throw new Error('Method "stopAll" must be implemented')
    }
}
