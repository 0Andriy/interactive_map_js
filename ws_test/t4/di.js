import { IoServer } from './IoServer.js';
import { InMemoryAdapter } from './adapters/InMemoryAdapter.js';
import { RedisAdapter } from './adapters/RedisAdapter.js';
import { createClient } from 'redis';

const USE_REDIS = process.env.USE_REDIS === 'true';

let adapterFactory;

if (USE_REDIS) {
  const pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);

  adapterFactory = (nspName) => new RedisAdapter(nspName, pubClient, subClient);
} else {
  // Належний оновлений InMemoryAdapter фабрикується тут
  adapterFactory = (nspName) => new InMemoryAdapter(nspName);
}

// Конфігуруємо базову адресу та відкладене видалення кімнат (наприклад, 10 секунд)
const io = new IoServer(adapterFactory, {
  path: '/ws-api/',        // Наша базова адреса
  gracePeriodMs: 10000     // 10 сек. кімнати зберігаються після відключення клієнта
});

export { io };
