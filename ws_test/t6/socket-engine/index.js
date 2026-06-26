// Імпортуємо головні класи
import { IoServer } from './core/IoServer.js'
import { InMemoryAdapter } from './adapters/InMemoryAdapter.js'
import { RedisAdapter } from './adapters/RedisAdapter.js'

// Експортуємо класи на випадок кастомізації
export { IoServer, InMemoryAdapter, RedisAdapter }

/**
 * Офіційна фабрика для швидкої ініціалізації сервера в одну стрічку.
 * Ховає від головного файлу App логіку створення адаптерів.
 */
export function createSocketServer(httpServer, redisClients = null, options = {}, logger = null) {
    let adapterFactory

    if (redisClients && redisClients.pubClient && redisClients.subClient) {
        adapterFactory = (name) =>
            new RedisAdapter(name, redisClients.pubClient, redisClients.subClient, { logger })
    } else {
        adapterFactory = (name) => new InMemoryAdapter(name)
    }

    const io = new IoServer(adapterFactory, logger, options)
    io.attach(httpServer)

    // Повертаємо інтерфейс керування
    return {
        // Повертаємо сам інстанс, якщо він знадобиться для io.emit() тощо
        io,
        // Прокидаємо метод наверх
        attach: (httpServer) => io.attach(httpServer),
    }
}
