import { EventEmitter } from 'events'

export class ParallelQueue extends EventEmitter {
    /**
     * @param {Object} logger - Логер
     * @param {number} maxConcurrent - Ліміт паралельних завантажень
     */
    constructor(logger, maxConcurrent = 2) {
        super()
        this.tasks = []
        this.activeCount = 0
        this.maxConcurrent = maxConcurrent
        this.logger = logger?.child?.({ component: 'ParallelQueue' }) || logger
    }

    /**
     * Додати нове завдання динамічно
     * @param {Object} task
     * @param {number} [task.priority=0] - Чим вище число, тим швидше запуститься
     */
    enqueue(task) {
        task.priority = task.priority || 0
        this.tasks.push(task)

        // Сортуємо: вищий пріоритет стає в початок масиву
        this.tasks.sort((a, b) => b.priority - a.priority)

        this.logger?.info?.('Завдання додано в чергу', {
            name: task.name,
            priority: task.priority,
            queueLength: this.tasks.length,
        })
        this._next()
    }

    async _next() {
        if (this.activeCount >= this.maxConcurrent || this.tasks.length === 0) {
            return
        }

        this.activeCount++
        const task = this.tasks.shift()

        try {
            this.logger?.info?.('▶️ Запуск паралельного завдання', {
                url: task.url,
                active: this.activeCount,
            })
            await this.worker(task)
        } catch (err) {
            this.logger?.error?.('❌ Помилка в робочому потоці', {
                url: task.url,
                error: err.message,
            })
        } finally {
            this.activeCount--
            this.logger?.debug?.('Завдання завершено', { active: this.activeCount })

            if (this.tasks.length === 0 && this.activeCount === 0) {
                this.emit('drain')
            } else {
                this._next() // Пробуємо запустити наступне
            }
        }
    }
}
