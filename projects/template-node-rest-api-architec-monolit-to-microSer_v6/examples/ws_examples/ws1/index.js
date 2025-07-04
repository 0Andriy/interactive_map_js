// index.js
import { WebSocketServerManager } from './server.js'
import http from 'http'

// Створюємо HTTP сервер (обов'язково для ws, якщо хочемо використовувати той же порт)
const httpServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('WebSocket server is running\n')
})

const PORT = process.env.PORT || 3000

httpServer.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}`)
})

// Ініціалізуємо наш WS-менеджер
const io = new WebSocketServerManager({
    server: httpServer, // Передаємо HTTP сервер
    // Для масштабування розкоментуйте та налаштуйте Redis
    // redisOptions: { url: 'redis://localhost:6379' }
})

// --- Дефолтний простір імен ('/') ---
io.on('connection', (socket) => {
    console.log(`Default namespace: New client connected with ID: ${socket.id}`)

    // Відправка повідомлення тільки підключеному сокету
    socket.emit('welcome', `Ласкаво просимо, ваш ID: ${socket.id}`)

    // Всі події, що надходять від цього сокета
    socket.on('message', (data) => {
        console.log(`Default ns, Socket ${socket.id} received message:`, data)
        // Розсилка повідомлення всім сокетам у цьому просторі імен
        io.emit('chat message', `${socket.id}: ${data}`)
    })

    socket.on('join room', (roomName) => {
        socket.join(roomName)
        // Розсилка усім в кімнаті, що користувач приєднався
        io.to(roomName).emit('room notification', `${socket.id} приєднався до кімнати ${roomName}`)
    })

    socket.on('leave room', (roomName) => {
        socket.leave(roomName)
        io.to(roomName).emit('room notification', `${socket.id} покинув кімнату ${roomName}`)
    })

    socket.on('room chat', ({ roomName, message }) => {
        console.log(`Default ns, Socket ${socket.id} sent to room ${roomName}: ${message}`)
        io.to(roomName).emit('room message', { sender: socket.id, message: message })
    })

    socket.on('broadcast message', (data) => {
        // Надіслати всім, крім відправника
        socket.broadcast('broadcast_from_sender', `[Броадкаст від ${socket.id}]: ${data}`)
    })

    socket.on('disconnect', () => {
        console.log(`Default namespace: Client ${socket.id} disconnected.`)
    })

    socket.on('image_upload', (imageData) => {
        console.log(
            `Default ns, Socket ${socket.id} received image data (Buffer of length ${imageData.length})`,
        )
        // Розсилаємо бінарні дані іншим клієнтам у дефолтному просторі імен
        // Важливо: передаємо true як останній аргумент для isBinary
        io.emit('image_broadcast', imageData, true)
    })
})

// --- Додатковий простір імен '/chat' ---
const chatNamespace = io.of('/chat')
chatNamespace.on('connection', (socket) => {
    console.log(`Chat namespace: New client connected with ID: ${socket.id}`)

    socket.emit('chat welcome', `Привіт у чаті, ${socket.id}!`)

    socket.on('message', (data) => {
        console.log(`Chat ns, Socket ${socket.id} received chat message:`, data)
        // Розсилка всьому простору імен '/chat'
        chatNamespace.emit('chat message', `[Chat-${socket.id}]: ${data}`)
    })

    socket.on('disconnect', () => {
        console.log(`Chat namespace: Client ${socket.id} disconnected.`)
    })
})

// --- Клієнтський код для тестування (наприклад, у браузері) ---
/*
// Клієнт для дефолтного простору імен
const wsDefault = new WebSocket('ws://localhost:3000');

wsDefault.onopen = () => {
    console.log('Default WS Connected');
    wsDefault.send(JSON.stringify({ event: 'join room', data: 'general' }));
    setTimeout(() => {
        wsDefault.send(JSON.stringify({ event: 'room chat', data: { roomName: 'general', message: 'Всім привіт у general!' } }));
    }, 500);
    setTimeout(() => {
        wsDefault.send(JSON.stringify({ event: 'broadcast message', data: 'ЦЕ БРОАДКАСТ' }));
    }, 1000);
    setTimeout(() => {
        wsDefault.send(JSON.stringify({ event: 'message', data: 'Просто повідомлення' }));
    }, 1500);
};
wsDefault.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    console.log('Default WS:', msg);
};
wsDefault.onclose = () => console.log('Default WS Disconnected');
wsDefault.onerror = (error) => console.error('Default WS Error:', error);

// Клієнт для '/chat' простору імен
const wsChat = new WebSocket('ws://localhost:3000/chat');

wsChat.onopen = () => {
    console.log('Chat WS Connected');
    wsChat.send(JSON.stringify({ event: 'message', data: 'Hello from chat client!' }));
};
wsChat.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    console.log('Chat WS:', msg);
};
wsChat.onclose = () => console.log('Chat WS Disconnected');
wsChat.onerror = (error) => console.error('Chat WS Error:', error);

*/

// <===============================================>
// Клієнтський код для тестування бінарних даних (браузер)
/*
// Приклад відправки бінарних даних з клієнта
const wsDefault = new WebSocket('ws://localhost:3000');

wsDefault.onopen = () => {
    console.log('Default WS Connected');
    // ... інші відправки

    // Створюємо простий бінарний буфер (наприклад, для PNG заголовка)
    const binaryData = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    // Відправляємо бінарні дані.
    // На клієнті немає окремої функції emit з isBinary,
    // просто відправляємо серіалізований буфер.
    // MessageProtocol на сервері визначить, що це бінарні дані.
    wsDefault.send(JSON.stringify({ event: 'image_upload', data: Array.from(binaryData), isBinary: true }));
    // АБО, якщо браузер підтримує відправку Blob/ArrayBuffer безпосередньо:
    // wsDefault.send(binaryData.buffer); // Це відправить "сирий" буфер.
    // Тоді на сервері в MessageProtocol.deserialize потрібно буде розрізняти,
    // чи це "сирий" буфер, чи JSON, який містить бінарні дані.
    // Наша поточна реалізація очікує JSON або бінарний протокол, який ми самі визначили.

    // Для відправки чисто бінарних даних без метаданих (як "ping")
    // wsDefault.send('ping');
};
wsDefault.onmessage = (event) => {
    // Якщо отримали бінарні дані, event.data буде ArrayBuffer
    if (event.data instanceof ArrayBuffer) {
        console.log('Received binary data (ArrayBuffer):', event.data);
        const uint8 = new Uint8Array(event.data);
        console.log('As Uint8Array:', uint8);
        // Тут потрібна логіка розпарсингу бінарного протоколу з MessageProtocol
        // Щоб отримати подію та власне дані
        // Наприклад: const parsed = MessageProtocol.deserialize(event.data);
        // console.log('Parsed binary message:', parsed);

        // Якщо ви очікуєте бінарні дані від нашого протоколу:
        const reader = new FileReader();
        reader.onload = function() {
            const buffer = new Uint8Array(reader.result);
            const parsed = MessageProtocol.deserialize(buffer); // Десеріалізуємо отриманий буфер
            if (parsed && parsed.isBinary) {
                console.log('Received binary broadcast for event:', parsed.event, 'data length:', parsed.data.length);
                // parsed.data тепер Buffer
            } else {
                console.log('Received text message:', parsed);
            }
        };
        reader.readAsArrayBuffer(event.data);

    } else {
        const msg = JSON.parse(event.data);
        console.log('Default WS (text):', msg);
    }
};
// ...
*/

/*
## Пояснення та Важливі Моменти

### Heartbeat:
* **`HEARTBEAT_INTERVAL` та `HEARTBEAT_TIMEOUT`**: Це критичні параметри. **`HEARTBEAT_INTERVAL`** визначає, як часто сервер надсилає пінг. **`HEARTBEAT_TIMEOUT`** – це час, протягом якого сервер чекає на понг. Таймаут завжди має бути більшим за інтервал.
* **`isAlive` флаг**: Використовується для відстеження стану відповіді.
* **`ws.terminate()`**: Це жорстке закриття з'єднання, яке використовується, якщо клієнт не відповідає.

### Бінарні Дані:
* **Змінений `MessageProtocol`**:
    * Тепер він визначає, чи є дані бінарними, за допомогою **`isBinary`** аргументу.
    * **Префікс `BINARY_PREFIX`**: Це один або кілька байтів на початку повідомлення, які вказують, що решта повідомлення є бінарним за нашим протоколом. Це дозволяє серверу легко розрізняти текстові JSON-повідомлення від наших кастомних бінарних.
    * **Довжина метаданих**: Для бінарних повідомлень ми включаємо довжину JSON-метаданих (події, простору імен тощо) у 4-байтовому форматі. Це дозволяє коректно прочитати метадані, а потім основні бінарні дані.
    * **Base64 для Redis**: **Redis не працює безпосередньо з бінарними даними** у повідомленнях Pub/Sub. Тому ми кодуємо бінарні дані в Base64 перед відправкою до Redis і декодуємо назад при отриманні.

### Важливо для клієнтської сторони:
* Клієнтський WebSocket API також повинен бути обізнаний з протоколом. При відправці бінарних даних, клієнт повинен серіалізувати їх відповідно до нашого `MessageProtocol` (тобто, створити буфер з префіксом, довжиною метаданих, метаданими та власне бінарними даними).
* При отриманні повідомлень, клієнт повинен перевіряти, чи `event.data` є `ArrayBuffer` (що вказує на бінарні дані), і потім десеріалізувати їх за нашим протоколом, щоб отримати подію та дані.

Ці доповнення значно підвищують надійність та функціональність вашої WebSocket-бібліотеки. Тепер вона може ефективно обробляти "мертві" з'єднання та передавати не лише текст, а й будь-які бінарні дані, такі як зображення, аудіо чи відео потоки.
*/
