const ws = new WebSocket('ws://localhost:3000');

// Функція для імітації socket.emit
function emit(event, data) {
  ws.send(JSON.stringify({ event, data }));
}

ws.onopen = () => {
  // 1. Входимо в кімнату
  emit('join-room', { roomName: 'gamers_zone' });

  // 2. Через 2 секунди пишемо туди повідомлення
  setTimeout(() => {
    emit('message-to-room', { roomName: 'gamers_zone', text: 'Всім привіт!' });
  }, 2000);
};

// Функція для імітації socket.on
ws.onmessage = (message) => {
  const { event, data } = JSON.parse(message.data);
  console.log(`Отримано подію [${event}]:`, data);
};
