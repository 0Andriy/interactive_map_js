import express from 'express';
import { createServer } from 'http';
import { io } from './src/di.js';

const app = express();
const httpServer = createServer(app);

io.attach(httpServer);

// --- СТАТИСТИКА (Ваше перше запитання, тепер з урахуванням системних Namespace) ---
app.get('/api/ws-info', (req, res) => {
  const stats = {};
  for (const [nspName, nspInstance] of io.namespaces.entries()) {
    stats[nspName] = {
      totalConnections: nspInstance.sockets.size,
      rooms: nspInstance.adapter.getRoomsDump()
    };
  }
  res.json(stats);
});

// ==========================================
// 1. Організація ЧАТ-ПРОСТОРУ НАЗВ (/chat)
// ==========================================
const chatNsp = io.of('/chat');

// Додаємо Middleware для авторизації за токеном
chatNsp.use((socket, next) => {
  const token = socket.handshake.query.token;
  if (token === 'valid-secret-token') {
    socket.user = { id: 'usr_99', name: 'Олексій' }; // Зберігаємо дані в об'єкт сокета
    return next(); // Успішно пройдено
  }
  next(new Error('Authentication error: Invalid Token')); // Помилка авторизації
});

chatNsp.on('connection', (socket) => {
  console.log(`[Чат] Успішно авторизовано користувача ${socket.user.name} (Socket ID: ${socket.id})`);

  socket.on('join', (data) => {
    socket.join(data.room);
    // Надсилаємо повідомлення усім в кімнаті, крім себе (аналог socket.broadcast.to().emit())
    socket.to(data.room).emit('sys-message', `${socket.user.name} увійшов в чат.`);
  });

  socket.on('msg', (data) => {
    // Надсилаємо повідомлення всім у кімнаті
    chatNsp.adapter.broadcast(data.room, { 
      event: 'new-msg', 
      data: { sender: socket.user.name, text: data.text } 
    });
  });
});

// ==========================================
// 2. Організація ІГРОВОГО ПРОСТОРУ НАЗВ (/game)
// ==========================================
const gameNsp = io.of('/game');

gameNsp.on('connection', (socket) => {
  console.log(`[Гра] Підключено геймера до ігрового процесу: ${socket.id}`);
  
  socket.on('move', (coords) => {
    // Якась ігрова логіка...
  });
});

httpServer.listen(3000, () => console.log('Сервер працює на порту 3000'));
