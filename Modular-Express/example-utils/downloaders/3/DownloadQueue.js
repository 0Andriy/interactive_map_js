import { EventEmitter } from 'events'

export class DownloadQueue extends EventEmitter {
    constructor(logger) {
        super()
        this.tasks = []
        this.logger = logger?.child?.({ component: 'Queue' }) || logger
        this.isProcessing = false
        this.currentDownloader = null
        this.results = []
    }

    /** Додає завдання в чергу */
    enqueue(url, options = {}) {
        this.tasks.push({ url, options })
        this.logger?.info?.('Додано завдання в чергу', { url, queueLength: this.tasks.length })
    }

    /** Запускає обробку черги */
    async start() {
        if (this.isProcessing) return
        this.isProcessing = true
        this.logger?.info?.('Запуск обробки черги')

        while (this.tasks.length > 0) {
            const task = this.tasks.shift()
            try {
                await this._processTask(task)
            } catch (err) {
                this.logger?.error?.('Помилка обробки завдання в черзі', {
                    url: task.url,
                    error: err.message,
                })
            }
        }

        this.isProcessing = false
        this.emit('drain', this.results)
        this.logger?.info?.('Усі завдання в черзі виконано')
    }

    /** Призупиняє поточне завантаження в черзі */
    pauseCurrent() {
        this.currentDownloader?.pause()
    }

    /** Відновлює поточне завантаження */
    resumeCurrent() {
        this.currentDownloader?.resumeDownload()
    }

    async _processTask(task) {
        // Ми створюємо новий завантажувач для кожного завдання через фабрику (передану зовні або створену тут)
        // Для спрощення припустимо, що завантажувач передається або ініціалізується в main.js
        this.emit('taskStart', task)

        // Тут логіка виконання, яка буде ініціалізована в main.js
        await this.configurator(task)
    }
}
