import { Logger } from './logger.js'
import { TokenStorage } from './token-storage.js'
import { AuthManager } from './auth-manager.js'
import { ApiClient } from './api-client.js'

// 1. Налаштування логера та сховища
const logger = new Logger({ service: 'UpdaterApp' })
const storage = new TokenStorage({ filePath: './session.json' })

// 2. Налаштування авторизації
const authManager = new AuthManager({
    storage,
    logger,
    refreshService: async (rt) => {
        // Емуляція запиту до API за новою парою токенів
        return { accessToken: 'new_at_' + Date.now(), refreshToken: 'new_rt_' + Date.now() }
    },
    onAuthError: async (err) => {
        console.error('--- КРИТИЧНА ПОМИЛКА: Перенаправлення на логін ---')
        process.exit(1) // Для прикладу в Node.js
    },
})

// 3. Створення клієнта
const api = new ApiClient('https://api.myapp.com', authManager, logger)

// 4. Підключення до прогресу (Observer)
api.on('progress', (p) => {
    process.stdout.write(`\r[${p.requestId}] Скачування ${p.endpoint}: ${p.percent}%`)
})

api.on('finished', (d) => {
    console.log(`\n✅ Файл збережено: ${d.destPath}`)
})

// 5. Виконання логіки
;(async () => {
    try {
        // Отримуємо список файлів через звичайний JSON запит
        const filesToSync = await api.request('/v1/files/sync', {
            method: 'POST',
            body: { version: '1.2' },
        })

        // Завантажуємо паралельно (наприклад, 2 файли)
        const downloads = [
            api.download('/v1/get/config.bin', './data/config.bin'),
            api.download('/v1/get/assets.pkg', './data/assets.pkg'),
        ]

        await Promise.all(downloads)
        console.log('Всі оновлення завершено успішно.')
    } catch (err) {
        console.error('Помилка виконання:', err)
    }
})()
