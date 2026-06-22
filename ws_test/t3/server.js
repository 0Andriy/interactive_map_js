import express from 'express';
import { createServer } from 'http';
import { io } from './src/di.js';

const app = express();
const httpServer = createServer(app);
io.attach(httpServer);

// Створюємо кімнату чату
const chatNsp = io.of('/chat');

// --- КЛАССТЕРНИЙ АГРЕГАТОР ІНФОРМАЦІЇ (Працює на N інстансах) ---
app.get('/api/ws-info', async (req, res) => {
  // Викликає RPC запит по всьому Redis-кластеру
  const globalRoomsDump = await chatNsp.adapter.fetchSockets();
  
  res.json({
    desc: "Повний глобальний злімок кімнат на всіх серверах Node.js",
    clusterRooms: globalRoomsDump
  });
});

// 1. Навішування логіки на життєвий цикл самого Namespace
chatNsp.on('before_connect', (socket) => {
  console.log(`[Неймспейс ЖЦ] Спроба підключення сокета ${socket.id}. Запуск масиву middleware...`);
});

chatNsp.on('connect_error', ({ socket, error }) => {
  console.log(`[Неймспейс ЖЦ] Сокет ${socket.id} відхилено через помилку: ${error.message}`);
});

chatNsp.on('disconnect', ({ socket, code, reason }) => {
  console.log(`[Неймспейс ЖЦ] Користувач залишив систему. Сервер видалив сокет ${socket.id}. Код закриття TCP: ${code}`);
});

// Middleware для авторизації
chatNsp.use((socket, next) => {
  if (socket.handshake.query.token === 'secret') return next();
  next(new Error('Auth failed'));
});

// 2. Бізнес-логіка та події Життєвого Циклу конкретного Сокета
chatNsp.on('connection', (socket) => {
  console.log(`[Сокет Подключено]: ${socket.id}`);

  // Навішування подій Життєвого Циклу на сокет
  socket.on('join', (roomName) => console.log(`[Сокет ЖЦ] Об'єкт ${socket.id} додано в ОЗП кімнати ${roomName}`));
  socket.on('leave', (roomName) => console.log(`[Сокет ЖЦ] Об'єкт ${socket.id} видалено з ОЗП кімнати ${roomName}`));
  socket.on('incoming_message', (packet) => console.log(`[Сокет ЖЦ] Мережевий буфер прийняв подію "${packet.event}"`));
  socket.on('packet_dropped', (packet) => console.warn(`[Сокет ЖЦ] Увага! Пакет "${packet.event}" було скинуто через перевантаження клієнта (Volatile)`));

  // Звичайні бізнес події
  socket.on('join-room', (data) => socket.join(data.room));
  
  socket.on('say', (data) => {
    socket.to(data.room).emit('hear', data.text);
  });
});

httpServer.listen(3000, () => console.log('Cluster-ready WS Node працює на порту 3000'));
