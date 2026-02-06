/**
 * Менеджер черги завантажень з підтримкою паралельності та повторних спроб.
 */
export class DownloadQueue {
    /**
     * @param {number} [concurrency=2] - Кількість одночасних завантажень
     * @param {Logger} [logger] - Логер
     * @param {number} [maxRetries=3] - Кількість спроб при збої
     */
    constructor(concurrency = 2, logger = null, maxRetries = 3) {
        this.concurrency = concurrency
        this.logger = logger?.child ? logger.child({ component: 'Queue' }) : logger
        this.maxRetries = maxRetries
        this.queue = []
        this.activeCount = 0
    }

    /**
     * Додає завдання до черги
     * @param {SecureDownloader} downloaderInstance
     */
    add(downloaderInstance) {
        this.queue.push(downloaderInstance)
        this._processNext()
    }

    async _processNext() {
        if (this.activeCount >= this.concurrency || this.queue.length === 0) return

        this.activeCount++
        const task = this.queue.shift()

        await this._executeWithRetry(task)

        this.activeCount--
        this._processNext()
    }

    async _executeWithRetry(task, attempt = 1) {
        try {
            await task.download()
        } catch (err) {
            if (err.name === 'AbortError') return

            const isFatal = ['AUTH_FATAL', 'NOT_FOUND_FATAL', 'HASH_MISMATCH'].includes(err.message)

            if (!isFatal && attempt < this.maxRetries) {
                const delay = 2000 * attempt
                this.logger?.warn?.(
                    `Спроба ${attempt} невдала для ${path.basename(task.dest)}. Рестарт через ${delay}ms...`,
                )
                await new Promise((r) => setTimeout(r, delay))
                return this._executeWithRetry(task, attempt + 1)
            }

            this.logger?.error?.(
                `Всі спроби вичерпано для ${path.basename(task.dest)}: ${err.message}`,
            )
        }
    }
}

/**
 * ПРИКЛАД ВИКОРИСТАННЯ:
 *
 * const logger = {
 *   info: (m, ctx) => console.log(`[INFO]`, ctx || '', m),
 *   child: (ctx) => ({ ...logger, info: (m) => logger.info(m, ctx) })
 * };
 *
 * const queue = new DownloadQueue(2, logger);
 *
 * const task = new SecureDownloader({
 *   url: 'https://example.com/file.zip',
 *   dest: './data/file.zip',
 *   getHeaders: async () => ({ 'Authorization': `Bearer ${token}` }),
 *   onProgress: (p) => console.log(`Прогрес: ${p.percent}%`)
 * }, logger);
 *
 * queue.add(task);
 */
