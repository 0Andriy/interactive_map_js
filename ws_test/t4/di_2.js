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
  adapterFactory = (nspName) => new InMemoryAdapter(nspName);
}

// Конфігурація під High-Load
const io = new IoServer(adapterFactory, {
  path: '/ws-api/',
  gracePeriodMs: 15000,      // 15 секунд тримаємо кімнати при розриві
  pingIntervalMs: 45000      // Оптимально: 45 секунд між пінгами для економії CPU
});

export { io };
