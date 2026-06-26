# Highload WebSocket Engine & SDK

Високопродуктивний, відмовостійкий та масштабований WebSocket-рушій для Node.js із симетричним клієнтом (SDK). Архітектура системи спроєктована за стандартами Enterprise-рішень (на кшталт Socket.io) та оптимізована під екстремальні навантаження (**Highload**) з мінімальним споживанням RAM та CPU.

## 🚀 Реалізований функціонал та можливості

### 1. Серверна частина (Core & Architecture)
*   **Низька зв'язаність (Loose Coupling):** Завдяки абстрактному класу `BaseAdapter`, бізнес-логіка повністю відокремлена від інфраструктури мережі та транспорту даних.
*   **Оптимізація пам'яті (Memory Safety):** Об'єкти системних сокетів не копіюються в карти кімнат. Кімнати зберігають суто рядкові `socketId` (Set структур), що мінімізує споживання RAM у розрахунку на одного клієнта.
*   **Пряма мутація посилань (V8 Optimize):** Пошуки в деревах `Map` зведені до мінімуму (патерн перевірки зліва направо). Рушій JS отримує пряме посилання на `Set` кімнати за одну операцію.
*   **Двофазне підключення (Safe Open):** Сигнал успішного з'єднання (`connect`) надсилається клієнту **тільки після** успішного проходження всіх етапів авторизації. Бізнес-слухачі подій ізольовані до моменту перевірки.
*   **Розширений Handshake (All-in-One):** Збір детальних метрик про пристрій (IP з урахуванням Cloudflare/Nginx проксі, User-Agent, Cookies, розпарсений Query, TLS-статус, реферер) на етапі HTTP Upgrade.

### 2. Кластеризація та Масштабування (Adapters)
*   **InMemoryAdapter:** Максимально швидкий адаптер для локальної розробки та монолітів, що працює в межах оперативної пам'яті одного процесу Node.js.
*   **RedisAdapter (Cluster Ready):** Адаптер для горизонтального масштабування (Microservices / Kubernetes / PM2 Cluster). Використовує Redis Pub/Sub для синхронізації кімнат між нодами:
    *   *serverId:* Захист від нескінченної ретрансляції повідомлень всередині мережі.
    *   *fetchSockets():* Міжсерверний Request/Response збір локальних кімнат по всьому кластеру протягом жорсткого таймауту в 250 мс з дедуплікацією ID.
    *   *clusterPresence:* Трансляція подій входу/виходу користувачів з кімнат на сусідніх серверах.

### 3. Надійність та Стійкість (Fault Tolerance & Highload Heartbeat)
*   **Нативний Подієвий Heartbeat:** Повна відмова від JSON-пакетів типу `__ping` на користь нативних бінарних WebSocket фреймів Ping/Pong (Opcode 0x9/0xA).
*   **Захист від блокування Event Loop:** Нативні пінги обробляються бібліотекою на низькому рівні (C++), запобігаючи помилковим розривам сесій, якщо Node.js тимчасово завис на обчисленні `JSON.parse`.
*   **Ліниве оцінювання (Lazy Activity Tracking):** Будь-яка вхідна бізнес-активність (`message`) автоматично переносить таймаут перевірки вперед, заощаджуючи до 50% сервісного трафіку та CPU.
*   **Crash Safety (EventBus):** Власна шина подій захищена блоками `try...catch`. Помилка (throw) в одному бізнес-коллбеку розробника не ламає виконання інших підписників і не "впускає" весь Node.js процес.

### 4. Клієнтська частина (Ультимативний SDK)
*   **Connection Recovery (Відновлення сесій):** При мікророзривах (ліфт, перемикання мереж) сокет зберігає свій `socketId` та `lastReceivedMsgId`. Сервер не створює нове підключення, а відновлює старе й донадсилає з пам'яті (кімнатних буферів) повідомлення, пропущені за час офлайну.
*   **Офлайн-буфер (Offline Queue):** Якщо у клієнта немає інтернету, метод `emit()` накопичує пакети в чергу і автоматично "вистрілює" їх на сервер відразу після відновлення авторизації.
*   **Експоненціальний Reconnect (Exponential Backoff):** Плавно збільшує таймаут між спробами перепідключення (1с, 2с, 4с, 8с... до 30с), щоб не створити DDOS-ефект лавини на сервер після його перезапуску.
*   **Cross-Tab Mutex (Блокування між вкладками):** Використовує `BroadcastChannel` та `LocalStorage` для вибору вкладки-лідера в браузері. Лише одна вкладка робить асинхронний HTTP-запит оновлення токена (Refresh Token), роздаючи результат іншим фоновим вкладкам.
*   **Нативний Online/Offline трекінг:** Миттєво реагує на системні події ОС `window.ononline`, ініціюючи реконнект без очікування таймерів експоненти.
*   **Платформна ізоляція:** Модуль автоматично визначає середовище (Браузер чи Node.js) та самостійно підключає потрібний клас WebSocket для роботи.

### 5. Безпека та Моніторинг
*   **CSWSH Protection (CORS):** Захист від атак підміни міжсайтових веб-сокетів. Сервер валідує заголовок `Origin` за білим списком доменів і відсікає нелегітимні запити з кодом `403 Forbidden` на стадії Upgrade.
*   **Двосторонній ACK з таймаутами:** Підтримка асинхронного проміс-підтвердження доставки повідомлень з обох сторін (`await socket.timeout(ms).emit(...)`).
*   **Патерн «Конверт Повідомлення» (Message Envelope):** До кожного пакету автоматично кріпляться метадані: унікальний `msgId`, `timestamp` сервера, цільовий `nsp` та масив кімнат `rooms`, звідки прийшло повідомлення.
*   **Глобальний REST API моніторинг:** Метод `io.getStats()` збирає детальну інформацію про аптайм, споживання оперативної пам'яті (RSS/Heap), кількість локальних сокетів, кількість активних бізнес-кімнат та точний каунт учасників у кожній із них (включаючи весь Redis кластер).

---

## 📂 Структура директорій проекту

```text
src/
├── modules/             # Технічний модуль WebSocket інфраструктури
│   └── socket-engine/
│       ├── adapters/    # Реалізації адаптерів кластеризації
│       │   ├── BaseAdapter.js
│       │   ├── InMemoryAdapter.js
│       │   └── RedisAdapter.js
│       └── core/        # Системні компоненти ядра рушія
│           ├── BroadcastOperator.js
│           ├── EventBus.js
│           ├── IoServer.js
│           ├── Namespace.js
│           └── Socket.js
├── socket-controllers/  # БІЗНЕС-ЛОГІКА (Контролери фіч)
│   ├── chat.controller.js
│   └── index.js
├── app.js               # Фабрика створення Express додатку
└── index.js             # Точка входу (HTTP listen + Ініціалізація io)
```

---

## 🛠 Швидкий старт (Приклад використання)

### Встановлення залежностей
```bash
npm install express ws
# (Опціонально для кластера): npm install redis
```

### Серверна частина (`src/index.js`)
```javascript
import http from 'http';
import express from 'express';
import { IoServer } from './modules/socket-engine/core/IoServer.js';
import { InMemoryAdapter } from './modules/socket-engine/adapters/InMemoryAdapter.js';

const app = express();
const httpServer = http.createServer(app);

// Ініціалізація сервера сокетів з CORS політикою
const adapterFactory = (name) => new InMemoryAdapter(name);
const io = new IoServer(adapterFactory, console, {
    path: '/ws',
    gracePeriodMs: 5000,    // 5с грації на відновлення сесії
    pingIntervalMs: 20000,  // 20с таймаут нативного Heartbeat
    cors: { origin: ['http://localhost:3000'] } // Дозволений домен фронтенду
});

io.attach(httpServer);
app.set('io', io);

// REST API Ендпоінт для моніторингу статистики
app.get('/api/v1/admin/stats', async (req, res) => {
    const stats = await req.app.get('io').getStats();
    res.json({ success: true, uptime: process.uptime(), data: stats });
});

// Обробка бізнес-подій у просторі імені /chat
io.of('/chat').on('connection', (socket) => {
    socket.on('join_room', (roomName) => socket.join(roomName));

    socket.on('send_message', (payload) => {
        io.of('/chat').to(payload.roomName).emit('new_message', { text: payload.text });
    });
});

httpServer.listen(3000, () => console.log('Server running on port 3000'));
```

### Клієнтська частина на Фронтенді (`src/app.js`)
```javascript
import { CustomSocketClient } from './CustomSocketClient.js';

// Асинхронний провайдер токенів з автоматичним Mutex-захистом між вкладками
const myAuthProvider = async () => {
    return { token: localStorage.getItem('token') || 'valid_secret_token_123' };
};

const socket = new CustomSocketClient('ws://localhost:3000/ws/chat', {
    authProvider: myAuthProvider,
    logger: console
});

socket.on('connect', async (data) => {
    console.log(`Успішно підключено!recovered=${data.recovered}`);

    // Виклик Promise-ACK запиту до сервера з таймаутом у 3 секунди
    const serverTime = await socket.timeout(3000).emit('get_server_time', {});
    console.log('Час сервера:', serverTime);
});

// Відправка повідомлення (якщо інтернет пропаде — пакет автоматично збережеться в офлайн-буфер)
socket.emit('send_message', { roomName: 'crypto_traders', text: 'Привіт усім!' });

socket.on('new_message', (data, callback, meta) => {
    console.log(`Повідомлення: ${data.text}. Прийшло з кімнати: ${meta.rooms}. Nsp: ${meta.nsp}`);
});
```

---

## 🔒 Ліцензія
Проєкт поширюється під ліцензією MIT. Модуль повністю готовий до використання в комерційних Highload-сервісах.
