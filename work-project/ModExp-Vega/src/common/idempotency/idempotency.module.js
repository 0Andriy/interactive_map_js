import { MemoryStorage } from './storage/memory.storage.js'
import { createIdempotencyGuard } from './idempotency.middleware.js'

// Експортуємо функцію ініціалізації модуля
export function initIdempotencyModule(config = {}) {
    // Тут логіка: якщо є конфіг Redis — беремо його, інакше Memory
    const storage = config.redisUrl
        ? new RedisStorage(config.redisUrl) // Коли з'явиться
        : new MemoryStorage()

    const middleware = createIdempotencyGuard(storage)

    // Повертаємо публічний API модуля (еквівалент exports в NestJS)
    return {
        idempotencyGuard: middleware,
        storage, // Може знадобитися для очищення кешу в тестах
    }
}
