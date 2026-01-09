export class UnifiedTaskManager {
    constructor() {
        this.registry = new Map() // EntityId -> Map(TaskId -> Interval)
    }

    /**
     * @param {Object} entity - Об'єкт (Socket, Room або Namespace)
     * @param {string} taskId - Унікальне ім'я задачі
     * @param {number} ms - Інтервал
     * @param {Function} fn - Що робити
     * @param {Function} condition - (Опціонально) Умова продовження (наприклад, () => room.size > 0)
     */
    addTask(entity, taskId, ms, fn, condition = null) {
        const entityId = entity.id || entity.name
        if (!this.registry.has(entityId)) {
            this.registry.set(entityId, new Map())
        }

        const tasks = this.registry.get(entityId)
        if (tasks.has(taskId)) return

        const interval = setInterval(() => {
            // Перевірка: чи об'єкт ще "живий"
            const isAlive = condition ? condition() : true

            if (isAlive) {
                fn(entity)
            } else {
                this.stopTask(entityId, taskId)
            }
        }, ms)

        tasks.set(taskId, interval)
    }

    stopTask(entityId, taskId) {
        const tasks = this.registry.get(entityId)
        if (tasks && tasks.has(taskId)) {
            clearInterval(tasks.get(taskId))
            tasks.delete(taskId)
            if (tasks.size === 0) this.registry.delete(entityId)
        }
    }

    stopAll(entityId) {
        const tasks = this.registry.get(entityId)
        if (tasks) {
            tasks.forEach((int) => clearInterval(int))
            this.registry.delete(entityId)
        }
    }
}
