import { WebSocketServer } from 'ws'

/**
 * Ініціалізує WebSocket-сервер та прив'язує його до існуючого HTTP(S) сервера.
 * Ця функція дозволяє маршрутизувати вхідні WebSocket-з'єднання на основі їхнього URL-шляху
 * до відповідних обробників. Вона використовує метод `handleUpgrade` бібліотеки `ws`
 * для керування процесом оновлення протоколу HTTP до WebSocket.
 *
 * @async
 * @param {object} options - Об'єкт конфігурації для ініціалізації WebSocket-сервера.
 * @param {import('http').Server} options.server - Існуючий екземпляр HTTP(S) сервера,
 * до якого буде прив'язано WebSocket-сервер. Цей сервер буде прослуховувати подію 'upgrade'.
 * @param {object} options.routes - Об'єкт, що відображає URL-шляхи на функції-обробники WebSocket-з'єднань.
 * Ключі об'єкта - це рядки, що представляють відносні URL-шляхи (наприклад, '/ws/chat'),
 * а значення - це функції, які будуть викликані при встановленні WebSocket-з'єднання.
 * Кожна функція-обробник отримує екземпляр WebSocket (`ws`) та оригінальний запит (`req`).
 * @example
 * {
 * '/ws/chat': (ws, req) => {
 * console.log('Клієнт підключився до чату');
 * ws.on('message', (message) => {
 * console.log(`Повідомлення в чаті: ${message}`);
 * ws.send(`Ви сказали: ${message}`);
 * });
 * },
 * '/ws/notifications': (ws, req) => {
 * console.log('Клієнт підключився до сповіщень');
 * // Логіка сповіщень
 * }
 * }
 * @param {object} [options.logger=console] - Необов'язковий об'єкт логера, що відповідає інтерфейсу `console`
 * (наприклад, з методами `log`, `warn`, `error`). Якщо не надано, буде використовуватися `console`.
 *
 * @returns {void} Функція не повертає значення, але ініціалізує слухачі на наданому HTTP-сервері.
 *
 * @throws {Error} Може викинути помилку, якщо `server` не є дійсним екземпляром сервера HTTP(S)
 * (хоча основна логіка `ws` обробляє більшість помилок оновлення протоколу).
 *
 * @example
 * ```javascript
 * import http from 'http';
 * import { initWebSocketServer } from './your-module-path'; // Шлях до вашого файлу
 *
 * // Створюємо HTTP сервер
 * const server = http.createServer((req, res) => {
 * res.writeHead(200, { 'Content-Type': 'text/plain' });
 * res.end('Hello from HTTP server!');
 * });
 *
 * const logger = {
 * log: (...args) => console.log('[APP LOG]', ...args),
 * error: (...args) => console.error('[APP ERROR]', ...args),
 * warn: (...args) => console.warn('[APP WARN]', ...args),
 * };
 *
 * // Визначаємо маршрути для WebSocket
 * const wsRoutes = {
 * '/ws/chat': (ws, req) => {
 * logger.log('Client connected to /ws/chat');
 * ws.on('message', (message) => {
 * logger.log(`Received from chat: ${message}`);
 * ws.send(`Echo: ${message}`);
 * });
 * ws.on('close', () => logger.log('Client disconnected from /ws/chat'));
 * ws.on('error', (err) => logger.error('WS chat error:', err));
 * },
 * '/ws/status': (ws, req) => {
 * logger.log('Client connected to /ws/status');
 * ws.send('Status updates incoming...');
 * const interval = setInterval(() => ws.send(`Status: ${new Date().toLocaleTimeString()}`), 1000);
 * ws.on('close', () => {
 * clearInterval(interval);
 * logger.log('Client disconnected from /ws/status');
 * });
 * },
 * };
 *
 * // Ініціалізуємо WebSocket-сервер
 * initWebSocketServer({
 * server,
 * routes: wsRoutes,
 * logger,
 * });
 *
 * // Запускаємо HTTP сервер
 * const PORT = 3000;
 * server.listen(PORT, () => {
 * logger.log(`HTTP server listening on port ${PORT}`);
 * logger.log('WebSocket routes configured: /ws/chat, /ws/status');
 * });
 *
 * // Приклад підключення з клієнта (браузер):
 * // const chatWs = new WebSocket('ws://localhost:3000/ws/chat');
 * // chatWs.onmessage = (event) => console.log(event.data);
 * // chatWs.onopen = () => chatWs.send('Привіт, чат!');
 *
 * // const statusWs = new WebSocket('ws://localhost:3000/ws/status');
 * // statusWs.onmessage = (event) => console.log(event.data);
 * ```
 */
async function initWebSocketServer({ server, routes = {}, logger = console }) {
    // Створюємо екземпляр WebSocketServer.
    // `noServer: true` означає, що WSS не буде самостійно запускати HTTP-сервер
    // або прослуховувати порт. Натомість, ми вручну інтегруємо його з існуючим `server`.
    const wss = new WebSocketServer({ noServer: true })

    // Внутрішня змінна для маршрутів, якщо `routes` не передано (хоча JSDoc вимагає його)
    // Цей рядок є дублікатом параметра і може бути прибраний, оскільки `routes` передається.
    // const routes = routes || {} // Можна видалити, бо routes вже є параметром.

    // Додаємо слухача до існуючого HTTP(S) сервера для події 'upgrade'.
    // Подія 'upgrade' спрацьовує, коли клієнт намагається "оновити" протокол з HTTP(S) на інший,
    // наприклад, WebSocket.
    server.on('upgrade', async (req, socket, head) => {
        // 1. Перевіряємо заголовок 'Upgrade'. Якщо він не 'websocket' (регістронезалежно),
        // то це не WebSocket-запит, і ми просто знищуємо сокет, оскільки не підтримуємо інші оновлення.
        if (req.headers.upgrade.toLowerCase() !== 'websocket') {
            socket.destroy()
            logger.warn(
                `Non-WebSocket upgrade request received for URL: ${req.url}. Socket destroyed.`,
            )
            return
        }

        // 2. Отримуємо вхідний URL запиту для маршрутизації.
        // Створюємо об'єкт URL, використовуючи `req.url` та `req.headers.host`
        // для формування повного URL, що дозволяє коректно розпарсити `pathname`.
        const requestUrl = new URL(req.url, `http://${req.headers.host}`)
        // Беремо з нього відносну частину URL, наприклад, '/ws/chat' з 'http://localhost:3000/ws/chat?user=test'.
        const pathname = requestUrl.pathname

        // 3. Знаходимо відповідний обробник WebSocket-з'єднання за шляхом.
        // Ми використовуємо `routes[pathname]`, щоб отримати функцію, зареєстровану для цього шляху.
        const handler = routes[pathname]
        if (!handler) {
            // Якщо обробник не знайдено для даного шляху, знищуємо сокет.
            // Це запобігає підключенню до незареєстрованих WebSocket-шляхів.
            socket.destroy()
            logger.warn(`No WebSocket handler found for pathname: ${pathname}. Socket destroyed.`)
            return
        }

        // 4. Передаємо керування бібліотеці `ws` для завершення оновлення протоколу.
        // `wss.handleUpgrade` приймає оригінальний HTTP-запит (`req`), сокет TCP (`socket`),
        // та буфер `head` (будь-які дані, отримані з сокета після HTTP-заголовків,
        // але до завершення оновлення).
        // Коли оновлення успішно завершено, викликається колбек, який надає готовий WebSocket-інтерфейс (`ws`).
        wss.handleUpgrade(req, socket, head, async (ws) => {
            // Після успішного оновлення, викликаємо знайдений обробник,
            // передаючи йому екземпляр WebSocket та оригінальний HTTP-запит.
            handler(ws, req)
            logger.debug(`WebSocket connection established for pathname: ${pathname}`)
        })
    })

    logger.debug('WebSocket upgrade listener set up on HTTP server.')
}
