import logger from '../../../common/logger/logger.js'
import config from '../../../config/config.js'

/**
 * БІЗНЕС-ЛОГІКА (Чистий DI)
 * Ця функція повністю ізольована. Залежності передаються через аргументи.
 * Вона викликається прямо в головному потоку, оскільки I/O операції не блокують Node.js.
 */
async function executeCleanupJob(sessionRepository, tenantNames) {
    for (const dbName of tenantNames) {
        logger?.info?.(`🧹 Початок очищення бази: [${dbName}]`)

        try {
            // Виконуємо видалення через справжній репозиторій
            const rowsDeleted = await sessionRepository.deleteExpiredSessions(7, dbName)
            logger?.info?.(`✅ Базу [${dbName}] очищено. Видалено ${rowsDeleted} рядків.`)
        } catch (error) {
            logger?.error?.(`❌ Помилка очищення бази [${dbName}]:`, error)
        }
    }
}

export class SessionCronWorker {
    /**
     * Залежності передаються через DI (Dependency Injection) у стилі NestJS
     * @param {Object} sessionRepository - Репозиторій сесій
     * @param {Object} dbManager - Менеджер баз даних
     */
    constructor(sessionRepository, dbManager) {
        this.sessionRepository = sessionRepository
        this.dbManager = dbManager
        this.timerId = null
        this.isExecutedToday = false

        // Об'єкт для збереження стану виконання кожного окремого завдання
        this.executionState = {
            cleanup: false,
        }
    }

    /**
     * Запуск щохвилинного таймера
     */
    init() {
        logger?.info?.('⏱️ Native Session Cron Worker initialized via DI.')

        this.timerId = setInterval(async () => {
            try {
                const now = new Date()
                const hours = now.getHours()
                const minutes = now.getMinutes()

                // --- ЗАДАЧА 1: Очищення сесій о 03:00 ---
                if (hours === 3 && minutes === 0) {
                    if (!this.executionState.cleanup) {
                        this.executionState.cleanup = true

                        logger?.info?.('⏰ Starting daily database session cleanup...')
                        const primaryDb = config?.oracleDB?.primaryDatabaseName

                        // const tenantNames =
                        //     typeof this.dbManager.list === 'function' ? this.dbManager.list() : []
                        const tenantNames = primaryDb ? [primaryDb] : []

                        await executeCleanupJob(this.sessionRepository, tenantNames)
                        logger?.info?.('🎉 Session cleanup finished.')
                    }
                } else {
                    // Скидаємо прапорець конкретно для цієї задачі в будь-який інший час
                    this.executionState.cleanup = false
                }
            } catch (err) {
                // Цей блок гарантує, що сервер НІКОЛИ не впаде через цей крон
                logger?.error?.('🚨 Critical error inside Cron Worker interval loop:', err)
            }
        }, 1000 * 60)
    }

    stop() {
        if (this.timerId) {
            clearInterval(this.timerId)
            logger?.info?.('🛑 Native Session Cron Worker stopped.')
        }
    }
}
