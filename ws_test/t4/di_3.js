import { IoServer } from './IoServer.js';
import { InMemoryAdapter } from './adapters/InMemoryAdapter.js';
import { RedisAdapter } from './adapters/RedisAdapter.js';
import { LoggerService } from './LoggerService.js';
import { createClient } from 'redis';

// 1. Створюємо Логер з потрібним рівнем деталізації логів (беремо з env)
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug'; // Можна змінити на 'info', щоб вимкнути спам дебагу
const logger = new LoggerService(LOG_LEVEL);

logger.info(`Конфігурація системи логування активована на рівні: "${LOG_LEVEL}"`, 'DI-Core');

const USE_REDIS = process.env.USE_REDIS === 'true';
let adapterFactory;

if (USE_REDIS) {
  logger.info('Конфігурація масштабування: Виявлено режим REDIS. Підключення до кластера...', 'DI-Core');
  const pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);

  adapterFactory = (nspName) => new RedisAdapter(nspName, pubClient, subClient);
} else {
  logger.info('Конфігурація масштабування: Вибрано локальний режим IN-MEMORY.', 'DI-Core');
  adapterFactory = (nspName) => new InMemoryAdapter(nspName);
}

// 4. Створюємо IoServer та інжектуємо туди готові залежності: Фабрику Адаптерів + Сервіс Логування
const io = new IoServer(adapterFactory, logger, {
  path: '/ws-api/',
  gracePeriodMs: 5000, // 5 сек для швидких тестів
  pingIntervalMs: 15000 // 15 сек між пінгами
});

export { io, logger };
