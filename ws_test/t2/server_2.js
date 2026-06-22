import express from 'express';
import { createServer } from 'http';
import { io } from './src/di.js';

const app = express();
const httpServer = createServer(app);
io.attach(httpServer);

const gameNsp = io.of('/game');

gameNsp.on('connection', (socket) => {
  
  // А. Тест НАОЧНОГО Acknowledgement (Сервер -> Клієнт)
  socket.emit('ping-client', { посилка: 'Привіт Фронтенд' }, (clientAnswer) => {
    console.log(`Клієнт отримав наш пінг і відповів: "${clientAnswer.status}"`);
  });

  // Б. Тест Acknowledgement (Клієнт -> Сервер)
  // Третій аргумент 'respond' — це функція зворотного виклику
  socket.on('get-server-time', (data, respond) => {
    console.log(`Клієнт попросив час`);
    if (respond) respond({ time: new Date().toLocaleTimeString() });
  });

  // В. Тест Volatile Messages (Ідеально для гейм-лупу 60fps)
  socket.on('player-move', (coords) => {
    socket.join('lobby_1');
    // Повідомлення надсилається з прапорцем volatile. 
    // Якщо у когось з гравців просяде інтернет — сервер не буде забивати пам'ять чергою застарілих координат.
    socket.volatile.to('lobby_1').emit('enemy-coords', coords);
  });

});

httpServer.listen(3000);
