import { Logger } from './logger.js'
import { TokenStorage } from './token-storage.js'
import { AuthManager } from './auth-manager.js'
import { ApiClient } from './api-client.js'
import { resolve } from 'path'

/**
 * КОНФІГУРАЦІЯ
 */
const BASE_URL = 'https://api.myapp.com'
const STORAGE_PATH = resolve('./session.json')
const DOWNLOAD_DIR = resolve('./updates')
const CONCURRENCY_LIMIT = 3 // Скільки файлів качати одночасно

/**
 * 1. ІНІЦІАЛІЗАЦІЯ КОМПОНЕНТІВ (DI - Dependency Injection)
 */
const logger = new Logger({ service: 'FileSyncModule' })

const storage = new TokenStorage({
    filePath: STORAGE_PATH,
    accessKey: 'my_access_token',
    refreshKey: 'my_refresh_token',
})

const authManager = new AuthManager({
    storage,
    logger,
    // Логіка оновлення токенів (звернення до реального API)
    refreshService: async (refreshToken) => {
        logger.info('Запит на оновлення токенів до сервера...')
        const response = await fetch(`${BASE_URL}/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: refreshToken }),
        })

        if (!response.ok) throw new Error('Refresh session failed on server')
        return await response.json() // Очікуємо { accessToken, refreshToken }
    },
    // Дія при повній втраті авторизації
    onAuthError: async (err) => {
        logger.error('СЕСІЯ ОСТАТОЧНО ВТРАЧЕНА. Потрібен ручний вхід.', { error: err.message })
        process.exit(1)
    },
})

const api = new ApiClient(BASE_URL, authManager, logger)

/**
 * 2. НАЛАШТУВАННЯ МОНІТОРИНГУ (Observer Pattern)
 */
const activeDownloads = new Map()

api.on('progress', (p) => {
    activeDownloads.set(p.requestId, p.percent)

    // Вивід загального статусу в один рядок консолі
    const status = Array.from(activeDownloads.entries())
        .map(([id, pct]) => `${id}: ${pct}%`)
        .join(' | ')

    process.stdout.write(`\r[ПРОГРЕС] ${status}`)
})

api.on('finished', (data) => {
    logger.info(`Файл успішно завантажено`, { file: data.endpoint, path: data.destPath })
    activeDownloads.delete(data.requestId)
})

api.on('error', (err) => {
    logger.error(`Помилка завантаження файлу`, { endpoint: err.endpoint, message: err.error })
})

/**
 * 3. ГОЛОВНА ЛОГІКА (Business Logic)
 */
async function startSync() {
    try {
        logger.info('--- Початок синхронізації ---')

        // КРОК 1: Перевірка валідності та отримання списку файлів через HttpClient
        // Метод request автоматично оновить токен, якщо він протух перед цим запитом
        const updateData = await api.request('/v1/files/check-validity', {
            method: 'POST',
            body: {
                current_files: [
                    { name: 'config.bin', hash: 'old-hash-123' },
                    { name: 'data.db', hash: 'old-hash-456' },
                ],
            },
        })

        const filesToDownload = updateData.files_to_update // Очікуємо масив [{ url, name }, ...]

        if (!filesToDownload || filesToDownload.length === 0) {
            logger.info('Всі файли актуальні. Оновлення не потрібне.')
            return
        }

        logger.info(
            `Знайдено ${filesToDownload.length} нових версій файлів. Починаємо завантаження...`,
        )

        // КРОК 2: Паралельне завантаження з обмеженням черги
        // Використовуємо простий підхід з чанками (або Promise.all для невеликої кількості)
        const downloadPromises = filesToDownload.map((file) => {
            const destination = resolve(DOWNLOAD_DIR, file.name)
            return api.download(file.url, destination)
        })

        // Запускаємо всі завантаження. Кожне з них незалежно обробить 401 помилку,
        // але завдяки Singleton AuthManager, сервер отримає лише ОДИН запит на refresh.
        await Promise.all(downloadPromises)

        console.log('\n')
        logger.info('--- СИНХРОНІЗАЦІЮ ЗАВЕРШЕНО УСПІШНО ---')
    } catch (error) {
        console.log('\n')
        logger.error('Критична помилка під час виконання синхронізації', {
            message: error.message,
            status: error.status,
        })
    }
}

// Запуск програми
startSync()
