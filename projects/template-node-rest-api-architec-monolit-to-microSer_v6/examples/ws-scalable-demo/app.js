// app.js
import { WebSocketServer } from 'ws'; // Використовуємо require для ws
import Manager from './src/Manager.js';
import LocalBroker from './src/brokers/LocalBroker.js';
// import RedisBroker from './src/brokers/RedisBroker.js'; // Запасний варіант

const wss = new WebSocketServer({ port: 8080 });

// Ініціалізуємо брокера та менеджера
const broker = new LocalBroker();
// const broker = new RedisBroker(); // Просто замініть рядок при масштабуванні
const manager = new Manager(broker);

wss.on('connection', function connection(ws) {
    console.log('Клієнт підключився.');
    const client = manager.addClient(ws);

    ws.on('error', console.error);

    ws.on('message', function message(data) {
        const incomingMessage = JSON.parse(data);
        // Передаємо логіку обробки повідомлення менеджеру
        manager.handleClientMessage(client, incomingMessage);
    });

    ws.on('close', () => {
        console.log(`Клієнт ${client.id} відключився.`);
        // Логіка видалення клієнта з менеджера
    });
});

console.log('WebSocket сервер запущено на ws://localhost:8080');
