import { BaseHttpClient, AdaptiveParallelClient, RetryHttpClient } from './HttpClient.js'
import { FileStorage } from './Storage.js'
import { BlobDownloader } from './BlobDownloader.js'
import { DownloadQueue } from './DownloadQueue.js'
import readline from 'readline'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// Dependency Injection: Logger
/**
 * Дефолтний логер з підтримкою рівнів, часу та метаданих
 */
/**
 * Професійний логер з рівнями та підтримкою прогрес-бару
 */
const createLogger = (context = {}, minLevel = 'info') => {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 }
    const currentMin = levels[minLevel] ?? 1

    return {
        child: (newContext) => createLogger({ ...context, ...newContext }, minLevel),

        _log: (level, color, msg, meta) => {
            if (levels[level] < currentMin) return

            const time = new Date().toISOString()
            const ctxStr = Object.keys(context).length ? ` [${JSON.stringify(context)}]` : ''
            const metaStr = meta ? ` \x1b[90m${JSON.stringify(meta)}\x1b[0m` : ''

            // Очищуємо рядок прогресу перед логом
            // \r\x1b[K очищує рядок з прогрес-баром перед виводом лога
            // \n в кінці гарантує, що наступний progress почнеться з нового рядка
            process.stdout.write(
                `\r\x1b[K${time} ${color}${level.toUpperCase().padEnd(5)}\x1b[0m: ${msg}${ctxStr}${metaStr}\n`,
            )
        },

        debug: (msg, meta) => createLogger(context, minLevel)._log('debug', '\x1b[34m', msg, meta),
        info: (msg, meta) => createLogger(context, minLevel)._log('info', '\x1b[32m', msg, meta),
        warn: (msg, meta) => createLogger(context, minLevel)._log('warn', '\x1b[33m', msg, meta),
        error: (msg, meta) => createLogger(context, minLevel)._log('error', '\x1b[31m', msg, meta),
    }
}

const logger = createLogger()

// Складання компонентів (Composition Root)
const baseClient = new BaseHttpClient(logger, 25000) // Таймаут 25с
const adaptiveClient = new AdaptiveParallelClient(baseClient, logger, 4) // До 4 потоків
const retryClient = new RetryHttpClient(adaptiveClient, logger, 5) // 5 спроб

const storage = new FileStorage('./ignore-nodemon', logger)

const taskId = 1713929
const fileId = 2223485
const host = `https://172.16.211.161:3000`
const endpoint = `api/v1/portal/tasks/${taskId}/files/${fileId}/range`
const url = `${host}/${endpoint}`
const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJQT1JUQUwiLCJzdWIiOiJNVUxJQVJBViIsImF1ZCI6IkFQUFMiLCJ0YWJfbm8iOjEzMDkzLCJsb2dpbiI6Ik1VTElBUkFWIiwicm9sZXMiOlsicG9ydGFsIl0sImRiTmFtZSI6IlRFU1QiLCJpc011bHRpTG9nb24iOmZhbHNlLCJpYXQiOjE3NzAzMjU0MzAsImV4cCI6MTc3MDMyODQzMH0.MF164oT0Bn3GSCA6i_kLyd9r89O2X9MIeRwesa8K29Q`



const downloader = new BlobDownloader({
    client: retryClient,
    storage: storage,
    logger: logger,
    config: {
        url: url,
        headers: {
            Authorization: `Bearer ${token}`,
        },
        defaultFileName: 'default_name.temp',
        chunkSize: 2 * 1024 * 1024, //  2 * 1024 * 1024 - 2MB - // Або null для скачування одним шматком
        speedWindowSize: 8,
    },
})

// --- ПІДКЛЮЧЕННЯ ДО СТАТИСТИКИ ---

// 1. Стрімова обробка прогресу (наприклад, для зовнішнього API)
downloader.on('progress', (m) => {
    const status = m.isPaused ? '\x1b[33m ⏸️ PAUSED\x1b[0m' : '\x1b[32m ▶️ BUSY\x1b[0m'
    process.stdout.write(
        `\r\x1b[K${status} [${m.percent}%] | ⚡ ${m.mbPerSec} MB/s | 📦 ${m.currentMB}/${m.totalMB} MB | ⏳ ${m.elapsedSec}s (залишилось ~${m.remainingSec}s)`,
    )
})

// 2. Фінальний результат як об'єкт
downloader.on('finish', (summary) => {
    console.log('\n\n📊 FINAL_RESULT_OBJECT:')
    console.dir(summary, { depth: null, colors: true })

    // const logRow = `${new Date().toISOString()},${s.fileName},${s.sizeMB},${s.avgSpeedMBps},${s.status}\n`
    // fs.appendFileSync('downloads_history.csv', logRow)
})

// 3. Відстеження помилок
downloader.on('error', (err) => {
    logger.error(`Failed: ${err.message}`)
})

// --- Інтерактивне керування клавіатурою ---

readline.emitKeypressEvents(process.stdin)
if (process.stdin.isTTY) process.stdin.setRawMode(true)

process.stdin.on('keypress', (s, k) => {
    if (k.name === 'p') downloader.pause()
    if (k.name === 'r') downloader.resumeDownload()
    if (k.ctrl && k.name === 'c') {
        logger.warn('Примусове завершення роботи...')
        process.exit()
    }
})

// Динамічний Watcher: стежимо за файлом jobs.json
logger.info('Скрипт запущено. Додавайте завдання в jobs.json як [{ "url": "...", "id": "video1" }]')
fs.watchFile('./jobs.json', (curr, prev) => {
    try {
        const content = fs.readFileSync('./jobs.json', 'utf8')
        const jobs = JSON.parse(content)
        if (Array.isArray(jobs)) {
            jobs.forEach((job) => queue.enqueue(job))
            // Очищуємо файл після додавання, щоб не було дублів
            fs.writeFileSync('./jobs.json', '[]')
        }
    } catch (e) {
        logger.error('Помилка парсингу jobs.json')
    }
})

// Парсинг аргументів
const args = process.argv.slice(2)
const options = {
    // --fresh: видалити все і почати з 0
    fresh: args.includes('--fresh'),
    // --resume: продовжувати, якщо є .tmp файл (пріоритет над замовчуванням)
    resume: args.includes('--resume'),
    // Тільки рахувати хеш в пам'яті (без запису на диск)
    noFile: args.includes('--no-file'),
}

logger.info('Запуск системи завантаження LOB', options)
logger.info('Керування: [P] - Пауза, [R] - Продовжити, [Ctrl+C] - Вихід')

// Запуск
downloader.download(options).catch(async (err) => {
    if (err.message.includes('Hash mismatch') && options.resume) {
        logger.warn('Помилка хешу при докачуванні. Пробуємо завантажити файл з нуля...')
        await downloader.download({ ...options, resume: false, fresh: true })
    } else {
        logger.error(`Помилка: ${err.message}`)
    }
    process.exit(1)
})



// // --------------------
// const queue = new ParallelQueue(logger, 3) // 3 завантаження паралельно

// queue.worker = async (task) => {
//     const downloader = new BlobDownloader({
//         client: retryClient,
//         storage: new FileStorage('./ignore-nodemon', logger),
//         logger,
//         config: { url: task.url, defaultFileName: task.name },
//     })

//     // Кожне завантаження логує свій прогрес
//     downloader.on('progress', (m) => {
//         // Щоб не забивати консоль, логуємо лише кожні 10%
//         if (parseFloat(m.percent) % 10 === 0) {
//             logger.info(`[${task.name}] Прогрес: ${m.percent}% | Швидкість: ${m.mbPerSec} MB/s`)
//         }
//     })

//     await downloader.download({ resume: true })
// }

// // Додаємо завдання динамічно
// queue.enqueue({ url: 'http://.../1', name: 'video1.mp4' })
// queue.enqueue({ url: 'http://.../2', name: 'video2.mp4' })
// queue.enqueue({ url: 'http://.../3', name: 'video3.mp4' })
// // 1. Додаємо звичайне завдання
// queue.enqueue({ url: 'http://.../file1', name: 'slow_video.mp4', priority: 1 });
// // 2. Додаємо ТЕРМІНОВЕ завдання (воно піде в обробку наступним, навіть якщо черга велика)
// queue.enqueue({ url: 'http://.../urgent', name: 'URGENT_NEWS.mp4', priority: 10 });
// // 3. Додаємо фонове завдання
// queue.enqueue({ url: 'http://.../bg', name: 'background_music.mp3', priority: 0 });
