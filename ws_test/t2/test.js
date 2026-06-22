const chatWs = new WebSocket('ws://localhost:3000/chat?token=valid-secret-token');
chatWs.onopen = () => {
  chatWs.send(JSON.stringify({ event: 'join', data: { room: 'news_room' } }));
};
chatWs.onmessage = (msg) => console.log('Чат отримав:', JSON.parse(msg.data));


// 
const badChatWs = new WebSocket('ws://localhost:3000/chat?token=wrong-token');
badChatWs.onmessage = (msg) => console.log('Помилка від сервера:', JSON.parse(msg.data));
// Виведе: Отримано подію [connect_error]: "Authentication error: Invalid Token"


// 

const gameWs = new WebSocket('ws://localhost:3000/game');
gameWs.onopen = () => console.log('Підключено до гри!');
