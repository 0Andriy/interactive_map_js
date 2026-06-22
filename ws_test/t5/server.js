import { createServer } from 'http';
import { IoServer } from './src/IoServer.js';
import { logger, adapterFactory } from './src/di.js';
import { createExpressApp } from './src/api/appFactory.js';

// ==========================================
// 1. ІНІЦІАЛІЗАЦІЯ СОКЕТ-СЕРВЕРА СЕРВЕРОМ-ОРКЕСТРАТОРОМ
// ==========================================
// Налаштування адаптовано під високі навантаження (High-Load) та мікророзриви зв'язку
const io = new IoServer(adapterFactory, logger, {
  path: '/ws-api/',         // Базовий шлях для перехоплення WebSocket-з'єднань
  gracePeriodMs: 10000,     // 10 сек тримаємо кімнати в пам'яті після відключення клієнта (захист від мікророзривів)
  pingIntervalMs: 30000     // Високопродуктивна перевірка "зомбі"-клієнтів кожні 30 секунд
});

// ==========================================
// 2. ФАБРИКАЦІЯ EXPRESS APP ТА ПЕРЕДАЧА WS СЕРВЕРА ЧЕРЕЗ DI
// ==========================================
// Створюємо Express додаток, інжектуючи туди інстанс нашого сокет-сервера та логер
const app = createExpressApp(io, logger);

// ==========================================
// 3. СТВОРЕННЯ ЄДИНОГО HTTP-СЕРВЕРА Node.js
// ==========================================
// Загортаємо Express у стандартний HTTP-сервер
const httpServer = createServer(app);

// Прикріплюємо шар веб-сокетів до цього ж HTTP-сервера для спільного використання порту та Upgrade-запитів
io.attach(httpServer);

// ==========================================
// 4. СОКЕТНА БІЗНЕС-ЛОГІКА ТА ІВЕНТИ ЖИТТЄВОГО ЦИКЛУ
// ==========================================
// Створюємо ізольований простір назв для чату
const chatNsp = io.of('/chat');

// Middleware для авторизації за токеном перед допуском у простір назв
chatNsp.use((socket, next) => {
  const token = socket.handshake.query.token;
  if (token === 'valid-secret-token') {
    // Емулюємо отримання користувача (наприклад, з токена або сесії)
    socket.user = { 
      id: `usr_${Math.random().toString(36).substring(2, 7)}`, 
      name: socket.handshake.query.name || 'Гість' 
    };
    return next(); // Успішно пройшов авторизацію
  }
  // Перериваємо підключення, відправляючи помилку клієнту
  next(new Error('Authentication failed: Invalid Token'));
});

// Навішування глобальних подій на рівні всього простору назв (Namespace ЖЦ)
chatNsp.on('before_connect', (socket) => {
  logger.debug(`[Неймспейс ЖЦ] Спроба підключення сокета ${socket.id}. Запуск ланцюжка middleware...`, 'AppChat');
});

chatNsp.on('connect_error', ({ socket, error }) => {
  logger.warn(`[Неймспейс ЖЦ] Сокет ${socket.id} відхилено через помилку: ${error.message}`, 'AppChat');
});

// Фіксація події disconnecting (кімнати сокета ще доступні в пам'яті для фінальних дій!)
chatNsp.on('disconnecting', ({ socket, rooms }) => {
  logger.info(`[Неймспейс ЖЦ] Користувач ${socket.user?.name} (${socket.id}) починає відключатися.`, 'AppChat');
  logger.debug(`[Неймспейс ЖЦ] Сокет перебував у наступних кімнатах: ${Array.from(rooms).join(', ')}`, 'AppChat');
  
  // Перед тим як користувач вилетить, встигаємо сповістити інші сокети в його кімнатах
  for (const room of rooms) {
    if (room !== socket.id) { // Ігноруємо особисту кімнату сокета
      socket.to(room).emit('user_is_leaving', { 
        userId: socket.user?.id, 
        name: socket.user?.name,
        socketId: socket.id 
      });
    }
  }
});

chatNsp.on('disconnect', (socket) => {
  // Цей івент виконається ТІЛЬКИ після завершення gracePeriodMs (10 секунд), якщо користувач не перепідключився
  logger.warn(`[Неймспейс ЖЦ] 10 сек минуло. Об'єкт сокета ${socket.id} та його кімнати остаточно видалені з пам'яті.`, 'AppChat');
});

// Обробка успішного з'єднання та бізнес-подій конкретного сокета
chatNsp.on('connection', (socket) => {
  logger.info(`[Сокет Підключено] Користувач ${socket.user.name} успішно увійшов. Socket ID: ${socket.id}`, 'AppChat');

  // Події життєвого циклу на рівні окремого сокета (для внутрішнього моніторингу)
  socket.on('join', (roomName) => {
    logger.debug(`[Сокет ЖЦ] Об'єкт ${socket.id} успішно додано в ОЗП кімнати "${roomName}"`, 'AppChat');
  });

  socket.on('leave', (roomName) => {
    logger.debug(`[Сокет ЖЦ] Об'єкт ${socket.id} успішно видалено з ОЗП кімнати "${roomName}"`, 'AppChat');
  });

  socket.on('incoming_message', (packet) => {
    logger.debug(`[Сокет ЖЦ] Мережевий буфер прийняв подію "${packet.event}" з клієнта`, 'AppChat');
  });

  // --- БІЗНЕС-ПОДІЇ ЧАТУ ---
  
  // Вхід у кімнату чату
  socket.on('join-room', (data) => {
    const { roomName } = data;
    if (!roomName) return;

    socket.join(roomName);
    
    // Сповіщаємо інших учасників кімнати, крім себе (метод .to().emit())
    socket.to(roomName).emit('sys-message', {
      text: `Користувач ${socket.user.name} приєднався до розмови.`
    });

    logger.info(`Користувач ${socket.user.name} увійшов у кімнату "${roomName}". Усі кімнати сокета: ${Array.from(socket.rooms).join(', ')}`, 'AppChat');
  });

  // Обробка звичайного повідомлення в кімнату
  socket.on('say-to-room', (data) => {
    const { roomName, text } = data;
    if (!roomName || !text) return;

    // Масове розсилання повідомлення всім учасникам кімнати (через адаптер)
    chatNsp.adapter.broadcast(roomName, {
      event: 'new-message',
      data: {
        senderId: socket.user.id,
        senderName: socket.user.name,
        text: text,
        timestamp: new Date()
      }
    });

    logger.debug(`Користувач ${socket.user.name} надіслав повідомлення в кімнату "${roomName}"`, 'AppChat');
  });

  // Обробка швидкого гейм-лупу або стрімінгу координат (Приклад використання Volatile)
  socket.on('stream-coords', (coords) => {
    // Надсилаємо з прапорцем volatile — якщо у когось лагає мережа, застарілі координати просто дропнуться
    socket.volatile.to('gaming_room').emit('enemy-position', {
      userId: socket.user.id,
      coords
    });
  });
});

// ==========================================
// 5. ЗАПУСК СИНЕРГІЇ HTTP + WEBSOCKETS
// ==========================================
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  logger.info(`==================================================================`, 'AppBootstrap');
  logger.info(`  ГОЛОВНИЙ ОРКЕСТРАТОР: Сервер успішно розгорнуто та запущено!  `, 'AppBootstrap');
  logger.info(`  HTTP REST API та Веб-сокети сумісно працюють на порту: ${PORT}  `, 'AppBootstrap');
  logger.info(`==================================================================`, 'AppBootstrap');
});

// ==========================================
// 6. МЕХАНІЗМ GRACEFUL SHUTDOWN (КОРЕКТНЕ ЗАВЕРШЕННЯ РОБОТИ)
// ==========================================
/**
 * Функція для безпечної зупинки всіх процесів сервера без витоків пам'яті
 * @param {string} signal - Системний сигнал, який ініціював зупинку (SIGTERM/SIGINT)
 */
function handleGracefulShutdown(signal) {
  logger.warn(`------------------------------------------------------------------`, 'GracefulShutdown');
  logger.warn(` Отримано системний сигнал ${signal}. Початок процедури вимкнення... `, 'GracefulShutdown');
  logger.warn(`------------------------------------------------------------------`, 'GracefulShutdown');

  // Крок 1. Закриваємо HTTP-сервер
  // Він миттєво перестає приймати нові вхідні HTTP-запити та нові Upgrade до сокетів
  httpServer.close((err) => {
    if (err) {
      logger.error(`Критична помилка під час зупинки HTTP-сервера: ${err.message}`, 'GracefulShutdown');
      process.exit(1);
    }
    logger.info('Крок [1/3]: HTTP-сервер успішно зупинено. Нові з\'єднання заблоковано.', 'GracefulShutdown');
  });

  // Крок 2. Закриваємо сокет-сервер та очищуємо пам'ять учасників кластера
  // Метод io.close() всередині автоматично обнулить gracePeriodMs, відправить івент 'server_shutdown'
  // кожному клієнту, закриє TCP з кодом 1012, очистить масиви ОЗП та зупинить Heartbeat Loop.
  try {
    io.close();
    logger.info('Крок [2/3]: Усі сокети сповіщено, TCP розірвано, таймери Heartbeat видалено.', 'GracefulShutdown');
  } catch (error) {
    logger.error(`Помилка під час очищення сокет-сервера: ${error.message}`, 'GracefulShutdown');
  }

  // Крок 3. Надаємо невеликий технологічний таймаут (2 секунди)
  // Це необхідно для того, щоб Node.js встиг скинути поточні мережеві буфери, завершити активні
  // HTTP відповіді та закрити з'єднання з базою даних чи Redis без аварійного переривання.
  setTimeout(() => {
    logger.info('Крок [3/3]: Усі системні ресурси ОЗП та дескриптори файлів успішно звільнено.', 'GracefulShutdown');
    logger.info(`Процес Node.js завершено коректно. До побачення!`, 'GracefulShutdown');
    process.exit(0); // Виходимо з кодом успіху 0
  }, 2000);
}

// Перехоплюємо сигнал термінації від Docker, PM2 або Kubernetes (наприклад, при масштабуванні чи деплої)
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));

// Перехоплюємо сигнал переривання з консолі (коли розробник натискає Ctrl + C в терміналі)
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
