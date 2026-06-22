import { createServer } from 'http';
import { IoServer } from './src/IoServer.js';
import { logger, adapterFactory } from './src/di.js'; // Базові сервіси
import { createExpressApp } from './src/api/appFactory.js'; // Наша функція-фабрика

// 1. Створюємо сокет-сервер безпосередньо у загальному сервері
const io = new IoServer(adapterFactory, logger, {
  path: '/ws-api/',
  gracePeriodMs: 5000,
  pingIntervalMs: 15000
});

// 2. Формуємо Express App, передаючи створений інстанс сокетів
const app = createExpressApp(io, logger);

// 3. Створюємо HTTP сервер, загортаючи туди налаштований Express
const httpServer = createServer(app);

// 4. Прикріплюємо шар веб-сокетів до цього ж HTTP сервера
io.attach(httpServer);


// ==========================================
// СОКЕТНА БІЗНЕС-ЛОГІКА (Реєстрація івентів)
// ==========================================
const chatNsp = io.of('/chat');

// Приклад Middleware авторизації
chatNsp.use((socket, next) => {
  if (socket.handshake.query.token === 'valid') return next();
  next(new Error('Auth Token Invalid'));
});

chatNsp.on('connection', (socket) => {
  logger.info(`[Socket] Новий клієнт підключився до чату: ${socket.id}`, 'MainServer');
  
  socket.on('join-room', (data) => {
    socket.join(data.roomName);
  });
});


// 5. Запуск єдиної синергії HTTP + WebSockets
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  logger.info(`[Оркестратор] Загальний сервер запущено на порту ${PORT}`, 'AppBootstrap');
});
