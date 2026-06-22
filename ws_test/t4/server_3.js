import express from 'express';
import { createServer } from 'http';
import { io, logger } from './src/di.js'; // Забираємо логер з DI

const app = express();
const httpServer = createServer(app);
io.attach(httpServer);

const chatNsp = io.of('/chat');

chatNsp.use((socket, next) => {
  if (socket.handshake.query.token === 'valid') return next();
  next(new Error('Auth Token Invalid'));
});

chatNsp.on('connection', (socket) => {
  logger.info(`[Бізнес Логіка] Клієнт зайшов у чат. Запускаємо ініціалізацію профілю.`, `AppChat`);

  socket.on('join-room', (data) => {
    socket.join(data.roomName);
    logger.info(`[Бізнес Логіка] Користувач попросив увійти в кімнату ${data.roomName}`, `AppChat`);
  });
});

httpServer.listen(3000, () => {
  logger.info('HTTP + Custom Socket.IO сервер успішно розгорнуто на порту 3000', 'AppBootstrap');
});
