import { createClient } from 'redis';
import { IoServer } from './IoServer.js';
import { RedisAdapter } from './adapters/RedisAdapter.js';

// 1. Створюємо Redis-клієнти ззовні
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();

// Контейнер DI самостійно з'єднує Redis
await Promise.all([pubClient.connect(), subClient.connect()]);

// 2. Створюємо фабрику для адаптерів, прокидуючи туди залежності Redis (DI)
const redisAdapterFactory = (nspName) => {
  return new RedisAdapter(nspName, pubClient, subClient);
};

// 3. Збираємо сервер
const io = new IoServer(redisAdapterFactory);

export { io };
