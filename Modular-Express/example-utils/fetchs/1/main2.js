import { ApiClient } from './api-client.js'
import { AuthManager } from './auth-manager.js'
import { FileTokenStorage } from './token-storage.js'
import { Logger } from './logger.js'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { createHash } from 'crypto'

/**
 * Виконує задачі з обмеженням паралельності.
 * @param {Array<Function>} tasks - Масив функцій, що повертають проміси.
 * @param {number} limit - Максимальна кількість одночасних задач.
 */
async function runWithLimit(tasks, limit) {
    const results = []
    const executing = new Set()

    for (const task of tasks) {
        const p = Promise.resolve().then(() => task())
        results.push(p)
        executing.add(p)

        // Коли задача завершена, видаляємо її з набору активних
        const clean = () => executing.delete(p)
        p.then(clean).catch(clean)

        // Якщо ліміт досягнуто, чекаємо, поки хоча б одна задача звільниться
        if (executing.size >= limit) {
            await Promise.race(executing)
        }
    }
    return Promise.all(results)
}

const logger = new Logger({ service: 'UniversalApp' })
const storage = new FileTokenStorage({ filePath: './session.json' })
const auth = new AuthManager({
    storage,
    logger,
    refreshService: async (rt) => {
        const res = await fetch('https://api.example.com/refresh', {
            method: 'POST',
            body: JSON.stringify({ rt }),
        })
        return res.json()
    },
    onAuthError: () => process.exit(1),
})

const api = new ApiClient('https://api.example.com', auth, logger)

// Слухаємо прогрес
api.on('progress', (p) => {
    process.stdout.write(
        `\r[${p.requestId}] ${p.percent}% | Speed: ${(p.speed / 1024 / 1024).toFixed(2)} MB/s`,
    )
})

async function main() {
    try {
        // 1. JSON запит
        const files = await api.request('/api/files-to-update')

        // 2. Універсальний стрім для великого файлу
        const { stream, response } = await api.streamRequest('/get/large-file.bin')
        const hash = createHash('sha256')

        await pipeline(
            stream,
            // Функція генератор
            async function* (source) {
                for await (const chunk of source) {
                    hash.update(chunk) // Паралельна обробка
                    yield chunk
                }
            },
            createWriteStream('./downloads/large-file.bin'),
        )

        console.log(`\n✅ Готово. SHA256: ${hash.digest('hex')}`)
        console.log(`✅ ETag: ${response.headers.get('etag')}`)
    } catch (e) {
        logger.error('Помилка', e)
    }
}

// async function main() {
//     try {
//         // 1. Отримуємо список файлів
//         const { files } = await api.request('/v1/check-updates')

//         // 2. Створюємо масив задач
//         const tasks = files.map((file) => async () => {
//             const dest = resolve('./downloads', file.name)
//             return api.downloadWithVerify(file.url, dest, {
//                 algo: 'sha256',
//                 expectedHash: file.hash,
//             })
//         })

//         // 3. Запускаємо скачування по 3 файли одночасно
//         console.log(`Початок завантаження ${files.length} файлів (ліміт: 3)...`)
//         await runWithLimit(tasks, 3)

//         console.log('--- Оновлення завершено! ---')
//     } catch (e) {
//         logger.error('Критична помилка в main', { msg: e.message })
//     }
// }

main()
