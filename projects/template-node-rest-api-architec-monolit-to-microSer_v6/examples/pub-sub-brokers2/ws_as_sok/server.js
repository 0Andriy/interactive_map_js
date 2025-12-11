// server.js
import http from 'http'
import { WsManager } from './src/services/WsManager.js'
import { LocalBroker } from './src/services/LocalBroker.js'
// import { RedisBroker } from './src/services/RedisBroker.js'; // Предположим, что RedisBroker реализован аналогично LocalBroker

// --- DI SETUP ---
const USE_REDIS = process.env.NODE_ENV === 'production'
let brokerInstance

if (USE_REDIS) {
    // brokerInstance = new RedisBroker();
    console.log('Using Redis Broker (Scalable)')
    // Для примера используем LocalBroker, пока нет полной реализации Redis
    brokerInstance = new LocalBroker()
} else {
    brokerInstance = new LocalBroker()
    console.log('Using Local Broker (Development)')
}

const wsManager = new WsManager(brokerInstance)

// ... (налаштування HTTP сервера та ініціалізація wsManager) ...
await wsManager.initialize(server)
server.listen(8080)

// Приклад використання в будь-якому іншому місці вашого застосунку:
// Викликаємо метод на об'єкті Namespace, який повертає об'єкт Room,
// який вже вміє відправляти повідомлення через брокер.

setTimeout(async () => {
    console.log('Broadcasting message via custom Socket.IO-like API...')
    // io.to('general').emit('status', 'Server is online');
    await wsManager.defaultNamespace
        .to('general')
        .emit('status', { msg: 'Server is online', timestamp: Date.now() })
}, 3000)
