import express from 'express';
import { ChatApiController } from './ChatApiController.js';

/**
 * Фабрика для створення та налаштування Express додатка
 * @param {IoServer} io - Інстанс сокет-сервера, створений в server.js
 * @param {LoggerService} logger - Інстанс логера
 */
export function createExpressApp(io, logger) {
  const app = express();
  app.use(express.json());

  // Ініціалізуємо API Контролер, інжектуючи туди отриманий io та logger
  const chatApiController = new ChatApiController(io, logger);

  // --- РЕЄСТРАЦІЯ HTTP REST МАРШРУТІВ ---
  
  // Ендпоінт моніторингу кластера кімнат (Ваше перше запитання)
  app.get('/api/ws-info', async (req, res) => {
    const stats = {};
    for (const [nspName, nspInstance] of io.namespaces.entries()) {
      stats[nspName] = {
        totalConnections: nspInstance.sockets.size,
        rooms: await nspInstance.adapter.fetchSockets()
      };
    }
    res.json(stats);
  });

  // REST API ендпоінти, які взаємодіють із сокетами через контролер
  app.post('/api/admin/notify-room', (req, res) => chatApiController.sendSystemNotification(req, res));
  app.delete('/api/admin/kick/:socketId', (req, res) => chatApiController.kickUser(req, res));

  logger.info('Express додаток успішно сконфігуровано та підключено до сокет-сервера', 'ExpressFactory');
  
  return app;
}
