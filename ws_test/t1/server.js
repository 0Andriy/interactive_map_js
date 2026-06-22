import express from 'express';
import { createServer } from 'http';
import { io, roomManager } from './src/di.js'; // Імпортуємо готові інстанси з DI

const app = express();
const httpServer = createServer(app);

// 1. Інтегруємо наш клон socket.io з http-сервером
io.attach(httpServer);

// 2. Гнучкий HTTP-запит для отримання повної детальної інформації про кімнати
app.get('/api/ws-info', (req, res) => {
  res.json({
    totalConnections: io.sockets.size,
    ...roomManager.getStructureDump()
  });
});

// 3. Логіка обробки сокетів (синтаксис 1-в-1 як у socket.io)
io.on('connection', (socket) => {
  
  // Клієнт надсилає запит на вхід у кімнату
  socket.on('join-room', (data) => {
    const { roomName } = data;
    socket.join(roomName);

    // Сповіщаємо всіх у кімнаті, окрім того, хто зайшов
    socket.broadcastTo(roomName, 'user-joined', { msg: `Користувач ${socket.id} увійшов!` });
  });

  // Обробка звичайного повідомлення в кімнату
  socket.on('message-to-room', (data) => {
    const { roomName, text } = data;
    
    // Відправляємо всім учасникам кімнати
    socket.broadcastTo(roomName, 'new-message', { sender: socket.id, text });
  });

  socket.on('disconnect', () => {
    // Логіка, якщо потрібно щось зробити у бізнес-коді при виході
    console.log(`Користувач ${socket.id} залишив додаток.`);
  });
});

httpServer.listen(3000, () => {
  console.log('Сервер працює на порту 3000');
});
