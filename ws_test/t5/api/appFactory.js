import express from 'express';
import { ChatApiController } from './ChatApiController.js';

export function createExpressApp(io, logger) {
  const app = express();
  app.use(express.json());

  const chatApiController = new ChatApiController(io, logger);

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

  app.post('/api/admin/notify-room', (req, res) => chatApiController.sendSystemNotification(req, res));
  app.delete('/api/admin/kick/:socketId', (req, res) => chatApiController.kickUser(req, res));

  logger.info('Express додаток успішно сконфігуровано та підключено до сокет-сервера', 'ExpressFactory');
  
  return app;
}
