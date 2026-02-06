import { DownloadQueue } from './DownloadQueueManager.js'
import { CLIDashboard } from './CLIDashboard.js'

async function main() {
    const dashboard = new CLIDashboard()

    // Заглушка для логера (щоб не заважав малюванню CLI)
    // У реальному проекті логер краще писати у файл, а не в консоль
    const silentLogger = {
        info: () => {},
        warn: () => {},
        error: (m) => fs.appendFileSync('error.log', `${m}\n`),
        child: () => silentLogger,
    }

    const queue = new DownloadQueue(3, silentLogger)

    // Функція отримання токенів
    const getHeaders = async () => ({
        Authorization: 'Bearer YOUR_TOKEN',
    })

    // await queue.init(getHeaders)

    // Додаємо нові завдання (якщо черга була порожня)
    const filesToDownload = [
        { url: 'http://example.com/file1.zip', dest: './downloads/file1.zip' },
        { url: 'http://example.com/file2.zip', dest: './downloads/file2.zip' },
        { url: 'http://example.com/file3.zip', dest: './downloads/file3.zip' },
        { url: 'http://example.com/file4.zip', dest: './downloads/file4.zip' },
    ]

    filesToDownload.forEach((file) => {
        // Додаємо колбек прогресу, який шле дані в Dashboard
        queue.add({
            ...file,
            onProgress: (data) => dashboard.update(file.dest, data),
        })
    })
}

// Очищаємо консоль перед стартом
process.stdout.write('\x1Bc')
main().catch(console.error)
