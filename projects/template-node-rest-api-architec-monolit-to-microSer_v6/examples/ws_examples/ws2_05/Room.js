// src/server/Room.js
class Room {
    constructor(name) {
        this.name = name
        this.activeUserCount = 0 // Лічильник активних користувачів
        // Map<taskId, { func: Function, interval: number, timerId: NodeJS.Timeout | null }>
        this.tasks = new Map() // Зберігає періодичні задачі для цієї кімнати
    }

    /**
     * Збільшує лічильник активних користувачів у кімнаті.
     */
    incrementUserCount() {
        this.activeUserCount++
        if (this.activeUserCount === 1) {
            // Якщо це перший користувач
            this._startAllTasks() // Запускаємо всі задачі
        }
    }

    /**
     * Зменшує лічильник активних користувачів у кімнаті.
     */
    decrementUserCount() {
        this.activeUserCount--
        if (this.activeUserCount === 0) {
            // Якщо користувачів не залишилося
            this._stopAllTasks() // Зупиняємо всі задачі
        }
    }

    /**
     * Додає періодичну задачу до кімнати.
     * @param {string} taskId - Унікальний ідентифікатор задачі.
     * @param {Function} func - Функція, яку потрібно виконувати. Вона отримає `this` (об'єкт Room) як контекст.
     * @param {number} interval - Інтервал виконання задачі в мілісекундах.
     */
    addTask(taskId, func, interval) {
        if (this.tasks.has(taskId)) {
            console.warn(`Task '${taskId}' already exists in room '${this.name}'. Overwriting.`)
            this.stopTask(taskId) // Зупиняємо стару, якщо є
        }
        this.tasks.set(taskId, { func, interval, timerId: null })
        if (this.activeUserCount > 0) {
            // Якщо вже є користувачі, запускаємо негайно
            this._startTask(taskId)
        }
        console.log(`Task '${taskId}' registered for room '${this.name}'.`)
    }

    /**
     * Зупиняє конкретну задачу за її ID.
     * @param {string} taskId
     */
    stopTask(taskId) {
        const task = this.tasks.get(taskId)
        if (task && task.timerId) {
            clearInterval(task.timerId)
            task.timerId = null
            console.log(`Task '${taskId}' stopped in room '${this.name}'.`)
        }
    }

    /**
     * Видаляє конкретну задачу з кімнати.
     * @param {string} taskId
     */
    removeTask(taskId) {
        this.stopTask(taskId) // Зупиняємо перед видаленням
        this.tasks.delete(taskId)
        console.log(`Task '${taskId}' removed from room '${this.name}'.`)
    }

    _startTask(taskId) {
        const task = this.tasks.get(taskId)
        if (task && !task.timerId) {
            // Перевіряємо, чи задача існує і не запущена
            task.timerId = setInterval(() => {
                try {
                    // Виконуємо функцію в контексті кімнати, передаючи її саму
                    task.func(this)
                    // console.log(`Task '${taskId}' executed in room '${this.name}'.`); // Забагато логів
                } catch (e) {
                    console.error(`Error executing task '${taskId}' in room '${this.name}':`, e)
                }
            }, task.interval)
            console.log(
                `Task '${taskId}' started in room '${this.name}' with interval ${task.interval}ms.`,
            )
        }
    }

    _startAllTasks() {
        console.log(`Starting all tasks for room '${this.name}' (first user joined).`)
        this.tasks.forEach((_, taskId) => this._startTask(taskId))
    }

    _stopAllTasks() {
        console.log(`Stopping all tasks for room '${this.name}' (last user left).`)
        this.tasks.forEach((task, taskId) => this.stopTask(taskId))
    }
}

export default Room
