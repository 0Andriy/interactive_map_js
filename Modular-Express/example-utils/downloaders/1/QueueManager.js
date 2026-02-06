/**
 * Менеджер черги з автозбереженням стану та розумними повторами.
 */
export class PersistentDownloadQueue {
    /**
     * @param {Object} options
     * @param {number} [options.concurrency=2]
     * @param {number} [options.maxRetries=3]
     * @param {string} [options.stateFile='./queue.json']
     * @param {Logger} [logger]
     */
    constructor(options = {}, logger = null) {
        this.concurrency = options.concurrency || 2
        this.maxRetries = options.maxRetries || 3
        this.stateFile = options.stateFile || './queue.json'
        this.logger = logger?.child ? logger.child({ component: 'Queue' }) : logger

        this.queue = []
        this.activeCount = 0
        this.getHeadersFn = null
    }

    /**
     * Ініціалізація черги (завантаження збереженого стану)
     * @param {Function} getHeadersFn - Функція для отримання токенів
     */
    async init(getHeadersFn) {
        this.getHeadersFn = getHeadersFn
        try {
            const data = await fsp.readFile(this.stateFile, 'utf-8')
            const savedTasks = JSON.parse(data)
            this.logger?.info?.(`Завантажено ${savedTasks.length} завдань із черги`)
            for (const t of savedTasks) this.add(t)
        } catch (e) {
            this.logger?.info?.('Файл черги порожній або відсутній')
        }
    }

    /**
     * Додає завдання та зберігає чергу
     * @param {DownloadTask} task
     */
    add(task) {
        const downloader = new SecureDownloader(
            {
                ...task,
                getHeaders: this.getHeadersFn,
            },
            this.logger,
        )

        this.queue.push(downloader)
        this._saveState()
        this._processNext()
    }

    async _saveState() {
        const tasks = this.queue.map((d) => ({
            url: d.url,
            dest: d.dest,
            expectedHash: d.manualHash,
        }))
        await fsp.writeFile(this.stateFile, JSON.stringify(tasks, null, 2))
    }

    async _processNext() {
        if (this.activeCount >= this.concurrency || this.queue.length === 0) return

        this.activeCount++
        const task = this.queue.shift()
        await this._saveState() // видаляємо із черги в файлі, бо воно в роботі

        await this._executeWithRetry(task)

        this.activeCount--
        this._processNext()
    }

    async _executeWithRetry(task, attempt = 1) {
        try {
            await task.download()
            this.logger?.info?.(`Готово: ${path.basename(task.dest)}`)
        } catch (err) {
            const isFatal = ['AUTH_FATAL', 'NOT_FOUND_FATAL', 'HASH_MISMATCH'].includes(err.message)

            if (!isFatal && attempt < this.maxRetries) {
                this.logger?.warn?.(
                    `Помилка мережі для ${path.basename(task.dest)}. Спроба ${attempt}...`,
                )
                await new Promise((r) => setTimeout(r, 2000 * attempt))
                return this._executeWithRetry(task, attempt + 1)
            }

            this.logger?.error?.(`ФАТАЛЬНО для ${path.basename(task.dest)}: ${err.message}`)
        }
    }
}
