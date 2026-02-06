import { createHash } from 'crypto'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'

/**
 * @typedef {Object} DownloadProgress
 * @property {string} percent - Відсоток завантаження (4 знаки після коми).
 * @property {number} downloaded - Завантажено байт.
 * @property {string} downloadedMB - Завантажено мегабайт (форматований рядок).
 * @property {number} total - Загальний розмір файлу в байтах.
 * @property {string} totalMB - Загальний розмір файлу в мегабайтах.
 * @property {number} speed - Швидкість завантаження (байт/сек).
 * @property {string} speedHuman - Швидкість завантаження у зручному для читання форматі (MB/s).
 * @property {number|null} eta - Орієнтовний час до завершення в секундах.
 */

/**
 * @typedef {Object} DownloaderOptions
 * @property {string} url - URL ресурсу для завантаження.
 * @property {string} dest - Шлях до кінцевого файлу.
 * @property {function(): Promise<Object<string, string>>} [getHeaders] - Асинхронна функція для динамічного отримання заголовків (напр. Bearer токена).
 * @property {string} [expectedHash] - Очікуваний SHA256 хеш файлу для ручної перевірки.
 * @property {function(DownloadProgress): void} [onProgress] - Callback-функція для відстеження прогресу.
 */

/**
 * Клас для безпечного завантаження файлів з підтримкою дозавантаження,
 * валідації хешу та динамічної авторизації.
 *
 * @example
 * const downloader = new SecureDownloader({
 *   url: 'https://example.com/file.zip',
 *   dest: './downloads/file.zip',
 *   getHeaders: async () => ({ 'Authorization': `Bearer ${token}` }),
 *   onProgress: (p) => console.log(`Progress: ${p.percent}%`)
 * });
 *
 * try {
 *   await downloader.download();
 * } catch (err) {
 *   console.error('Download failed:', err.message);
 * }
 */
export class SecureDownloader {
    /**
     * Створює екземпляр SecureDownloader.
     * @param {DownloaderOptions} options - Конфігурація завантажувача.
     * @param {Object} [logger=null] - Об'єкт логера (напр. Pino або Winston).
     */
    constructor(options = {}, logger = null) {
        this.url = options.url
        this.dest = options.dest
        this.getHeaders = options.getHeaders // Функція для динамічного отримання заголовків (токенів)
        this.manualHash = options.expectedHash // Хеш переданий вручну (з бази)
        this.onProgress = options.onProgress || (() => {})

        // Створюємо дочірній логер для контексту конкретного файлу
        // Створюємо дочірній логер для контексту, якщо це можливо
        const context = {
            component: 'Downloader',
            file: path.basename(this.dest),
        }
        this.logger = logger?.child ? logger.child(context) : logger

        this.tmpPath = `${this.dest}.tmp`
        this.abortController = new AbortController()
        this.startTime = null
        this.serverHash = null // Хеш, який ми отримаємо з заголовків
    }

    /**
     * Запускає процес завантаження файлу.
     * Підтримує HTTP Range для дозавантаження частин файлу (.tmp).
     *
     * @async
     * @returns {Promise<string>} Шлях до завантаженого та перевіреного файлу.
     * @throws {Error} Викидає помилку при 401 (Expired Token), помилках мережі або незбігу хешу.
     */
    async download() {
        this.logger?.info?.(`Ініціалізація завантаження: ${path.basename(this.dest)}`, {
            url: this.url,
            dest: this.dest,
        })

        try {
            await fsp.mkdir(path.dirname(this.dest), { recursive: true })

            let startByte = 0
            try {
                const stats = await fsp.stat(this.tmpPath)
                startByte = stats.size
                this.logger?.debug?.('Знайдено частково завантажений файл', { startByte })
            } catch (e) {}

            this.startTime = Date.now()

            // Викликаємо функцію для отримання свіжих заголовків (напр. оновлений токен)
            const currentHeaders = this.getHeaders ? await this.getHeaders() : {}

            const response = await fetch(this.url, {
                headers: {
                    ...currentHeaders,
                    Range: `bytes=${startByte}-`,
                    'Accept-Encoding': 'identity',
                },
                signal: this.abortController.signal,
            })

            // --- Обробка помилок доступу та наявності ---
            if (response.status === 401) {
                this.logger?.error?.('Помилка авторизації: токен недійсний', { status: 401 })
                throw new Error('Unauthorized: Token expired')
            }

            if (response.status === 403) {
                this.logger?.error?.('Доступ до ресурсу заборонено', { status: 403 })
                throw new Error('Forbidden: You do not have permission to access this file')
            }

            if (response.status === 404) {
                this.logger?.error?.('Файл не знайдено на сервері', { status: 404, url: this.url })
                throw new Error('Not Found: The requested file does not exist')
            }
            // ------------------------------------------

            if (response.status === 416) {
                this.logger?.warn?.('Файл вже повністю завантажений або Range не підтримується', {
                    status: 416,
                })
                return await this.finalize()
            }

            if (!response.ok && response.status !== 206) {
                this.logger?.error?.(`HTTP Error: ${response.status} ${response.statusText}`, {
                    status: response.status,
                    statusText: response.statusText,
                })
                throw new Error(`HTTP Error: ${response.status}`)
            }

            const contentLength = parseInt(
                response.headers.get('content-length') ||
                    response.headers.get('x-file-size') ||
                    '0',
                10,
            )

            // Загальний розмір = те що докачуємо + те що вже було
            const totalSize = response.status === 206 ? contentLength + startByte : contentLength

            const reader = response.body.getReader()
            const fileStream = fs.createWriteStream(this.tmpPath, { flags: 'a' })

            this.logger?.info?.('Початок отримання даних', {
                totalSize,
                isResumed: response.status === 206,
            })

            let downloaded = startByte

            try {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    downloaded += value.length
                    if (!fileStream.write(value)) {
                        await new Promise((r) => fileStream.once('drain', r))
                    }

                    this._reportProgress(downloaded, totalSize)
                }
            } catch (error) {
            } finally {
                // Обов'язково закриваємо потік перед перейменуванням або хешуванням
                await new Promise((resolve) => fileStream.end(resolve))
            }

            return await this.finalize(response)
        } catch (error) {
            if (error.name === 'AbortError') {
                this.logger?.warn?.('Завантаження скасовано користувачем')
            } else {
                this.logger?.error?.('Критична помилка при завантаженні', { error: error.message })
            }
            throw error
        }
    }

    /**
     * Завершує процес завантаження: перевіряє цілісність та перейменовує тимчасовий файл.
     *
     * @async
     * @param {Response} [response=null] - Об'єкт відповіді Fetch API для отримання серверних заголовків хешу.
     * @returns {Promise<string>} Шлях до фінального файлу.
     * @throws {Error} Якщо хеш не збігається з очікуваним.
     */
    async finalize(response = null) {
        // Витягуємо хеш із заголовків (пріоритетний)
        this.serverHash =
            response?.headers.get('x-expected-hash') || response?.headers.get('x-sha256-checksum')

        // Визначаємо, який хеш використовувати для перевірки
        const finalExpectedHash = (this.serverHash || this.manualHash)?.toLowerCase()

        if (finalExpectedHash) {
            this.logger?.info?.('Верифікація цілісності файлу...', { algorithm: 'sha256' })
            const actualHash = (await this._calculateHash(this.tmpPath))?.toLowerCase()

            if (actualHash !== finalExpectedHash) {
                this.logger?.error?.('Валідація провалена: незбіг хешів', {
                    expected: finalExpectedHash,
                    actual: actualHash,
                })
                throw new Error('Integrity check failed: Hash mismatch')
            }

            this.logger?.debug?.('Хеш підтверджено успішно', {
                expected: finalExpectedHash,
                actual: actualHash,
            })
        }

        await fsp.rename(this.tmpPath, this.dest)
        this.logger?.info?.('Завантаження завершено', {
            dest: this.dest,
            time: `${((Date.now() - this.startTime) / 1000).toFixed(2)}s`,
        })

        return this.dest
    }

    /**
     * Обчислює SHA256 хеш файлу через Stream.
     *
     * @private
     * @async
     * @param {string} filePath - Шлях до файлу.
     * @returns {Promise<string>} Хеш файлу у форматі hex.
     */
    async _calculateHash(filePath) {
        const hash = createHash('sha256')
        const stream = fs.createReadStream(filePath)
        for await (const chunk of stream) {
            hash.update(chunk)
        }
        return hash.digest('hex')
    }

    /**
     * Розраховує метрики прогресу та викликає callback onProgress.
     *
     * @private
     * @param {number} downloaded - Кількість завантажених байтів.
     * @param {number} total - Загальний розмір файлу.
     */
    _reportProgress(downloaded, total) {
        const now = Date.now()
        const duration = (now - this.startTime) / 1000 //elapsed
        const speed = downloaded / (duration || 1) // байт/сек

        this.onProgress({
            percent: total ? ((downloaded / total) * 100).toFixed(4) : '0.0000',
            downloaded: downloaded,
            downloadedMB: (downloaded / 1024 / 1024).toFixed(4),
            total: total,
            totalMB: total ? (total / 1024 / 1024).toFixed(4) : '?',
            speed: speed, // швидкість в байтах
            speedHuman: `${(speed / 1024 / 1024).toFixed(4)} MB/s`,
            // Estimated Time of Arrival - скільки секунд залишилося до кінця
            eta: total ? Math.round((total - downloaded) / speed) : null,
        })
    }

    /**
     * Перериває активне завантаження за допомогою AbortController.
     * @public
     */
    stop() {
        this.logger?.warn?.('Отримано сигнал на зупинку завантаження')
        this.abortController.abort()
    }
}
