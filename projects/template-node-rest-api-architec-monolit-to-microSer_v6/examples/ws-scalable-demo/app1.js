// app.js
import { WebSocketServer } from 'ws'
import Manager from './src/Manager.js';
// import LocalBroker from './src/brokers/LocalBroker.js';
import RedisBroker from './src/brokers/RedisBroker.js'; // Використовуємо ефективний брокер

const wss = new WebSocketServer({ port: 8080 });

// Передаємо КЛАС брокера в менеджер.
// Менеджер сам його ініціалізує, передавши свій обробник повідомлень.
const manager = new Manager(RedisBroker);

wss.on('connection', function connection(ws) {
    const client = manager.addClient(ws);

    ws.on('message', function message(data) {
        const incomingMessage = JSON.parse(data);
        manager.handleClientMessage(client, incomingMessage);
    });

    ws.on('close', () => {
        // Потрібно також реалізувати manager.removeClient(client) і leaveRoom()
    });
});

console.log('WebSocket сервер запущено на ws://localhost:8080');
