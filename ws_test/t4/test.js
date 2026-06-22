// URL складається з: Базовий Шлях + Назва Простору Назв
const ws = new WebSocket('ws://localhost:3000/ws-api/chat');

ws.onopen = () => {
  console.log('З зєднання встановлено!');
  // Входимо в дві кімнати одночасно
  ws.send(JSON.stringify({ event: 'join-room', data: { roomName: 'lobby_gaming' } }));
  ws.send(JSON.stringify({ event: 'join-room', data: { roomName: 'vip_lounge' } }));
};
