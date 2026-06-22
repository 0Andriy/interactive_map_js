import express from 'express';
import { createServer } from 'http';
import { io } from './src/di.js';

const app = express();
const httpServer = createServer(app);
io.attach(httpServer);

const chatNsp = io.of('/chat');

// Глобальний REST API для збору інформації з усього кластера
app.get('/api/ws-info', async (req, res) => {
  const globalDump = await chatNsp.adapter.fetchSockets();
  res.json({
    message: "Кластерна статистика кімнат",
    data: globalDump
  });
});

// СПОСТЕРЕЖЕННЯ ЗА ЖИТТЄВИМ ЦИКЛОМ КЛІЄНТА
chatNsp.on('disconnecting', ({ socket, rooms }) => {
  // Тут ми дізнаємося, у яких саме кімнатах перебував клієнт прямо перед розривом!
  console.log(`[ЖЦ: Disconnecting] Сокет ${socket.id} починає відключатися.`);
  console.log(`Він перебував у кімнатах:`, Array.from(rooms));
  
  // Можна встигнути зробити розсилку іншим:
  for(const room of rooms) {
    socket.to(room).emit('user_is_leaving', { id: socket.id });
  }
});

chatNsp.on('disconnect', (socket) => {
  // Ця подія виконається ТІЛЬКИ через 10 секунд (gracePeriodMs), якщо користувач не повернувся
  console.log(`[ЖЦ: Disconnect] 10 секунд минули. Сокет ${socket.id} та його кімнати остаточно видалені з RAM.`);
});

chatNsp.on('connection', (socket) => {
  console.log(`Підключено: ${socket.id}`);

  socket.on('join-room', (data) => {
    socket.join(data.roomName);
    console.log(`Сокет ${socket.id} зайшов у ${data.roomName}. Поточні кімнати сокета:`, Array.from(socket.rooms));
  });
});

httpServer.listen(3000, () => console.log('Сервер запущено на http://localhost:3000'));
