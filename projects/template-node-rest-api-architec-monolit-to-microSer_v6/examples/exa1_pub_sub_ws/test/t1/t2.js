/**
 * @typedef {Object} WebSocketConnection
 * @property {function(string): void} send - Метод для відправки повідомлень клієнту.
 * @property {string} id - Унікальний ідентифікатор з'єднання.
 * // Можуть бути інші властивості
 */

// --- Імітація Redis ---
// У реальному проекті це буде взаємодія з Redis-сервером через бібліотеку (наприклад, ioredis).
const mockRedisData = new Map() // Імітуємо ключі Redis
const mockRedisPubSub = new Map() // Імітуємо Pub/Sub канали

const mockRedis = {
    /** @param {string} key @param {string} member */
    sadd: (key, member) => {
        if (!mockRedisData.has(key)) mockRedisData.set(key, new Set())
        mockRedisData.get(key).add(member)
        console.log(`[MockRedis] SADD ${key} ${member}`)
    },
    /** @param {string} key @param {string} member */
    srem: (key, member) => {
        if (mockRedisData.has(key)) {
            mockRedisData.get(key).delete(member)
            if (mockRedisData.get(key).size === 0) mockRedisData.delete(key)
        }
        console.log(`[MockRedis] SREM ${key} ${member}`)
    },
    /** @param {string} key @returns {Set<string>} */
    smembers: (key) => {
        const members = mockRedisData.get(key)
        console.log(
            `[MockRedis] SMEMBERS ${key}: ${members ? Array.from(members).join(', ') : '[]'}`,
        )
        return members || new Set()
    },
    /** @param {string} key */
    del: (key) => {
        mockRedisData.delete(key)
        console.log(`[MockRedis] DEL ${key}`)
    },
    /**
     * Імітація публікації повідомлення в Redis Pub/Sub.
     * @param {string} channel
     * @param {string} message
     */
    publish: (channel, message) => {
        console.log(`[MockRedisPubSub] PUBLISH ${channel}: ${message}`)
        if (mockRedisPubSub.has(channel)) {
            mockRedisPubSub.get(channel).forEach((subscriber) => subscriber(message))
        }
    },
    /**
     * Імітація підписки на канал Redis Pub/Sub.
     * @param {string} channel
     * @param {function(string): void} callback
     */
    subscribe: (channel, callback) => {
        if (!mockRedisPubSub.has(channel)) mockRedisPubSub.set(channel, [])
        mockRedisPubSub.get(channel).push(callback)
        console.log(`[MockRedisPubSub] SUBSCRIBE ${channel}`)
    },
}

/**
 * Клас для управління станом WebSocket-сервера в масштабованій архітектурі.
 * Кожен екземпляр цього класу представляє один WebSocket-сервер у кластері.
 */
class DistributedWebSocketServer {
    constructor(serverId) {
        this.serverId = serverId // Унікальний ID цього сервера
        /**
         * Зберігає посилання на об'єкти WebSocket-з'єднань, які підключені саме до цього сервера.
         * Ключ: Унікальний ID з'єднання (string).
         * Значення: Об'єкт WebSocketConnection.
         * @type {Map<string, WebSocketConnection>}
         */
        this.connectionIdToWebSocketObject = new Map()

        /**
         * Зв'язує унікальний ID з'єднання з ID користувача для з'єднань, що підключені до цього сервера.
         * Ключ: Унікальний ID з'єднання (string).
         * Значення: ID користувача (string).
         * @type {Map<string, string>}
         */
        this.connectionIdToUserId = new Map()

        // Підписуємося на канали Redis Pub/Sub для отримання міжсерверних повідомлень
        this.setupRedisSubscribers()
    }

    /**
     * Налаштовує підписки на Redis Pub/Sub для обробки міжсерверних повідомлень.
     */
    setupRedisSubscribers() {
        // Підписуємося на загальний канал для всіх повідомлень, що надсилаються в кімнати
        mockRedis.subscribe('global:room:messages', (messagePayload) => {
            const { roomId, message, senderServerId } = JSON.parse(messagePayload)
            // Ігноруємо повідомлення, які ми самі опублікували (якщо потрібно)
            // if (senderServerId === this.serverId) return;
            console.log(
                `[Server ${this.serverId}] Отримано повідомлення з Redis для кімнати ${roomId}: ${message}`,
            )

            // Отримуємо список користувачів у кімнаті з Redis (для повторної перевірки або якщо статус може змінитися)
            const userIdsInRoom = mockRedis.smembers(`room:${roomId}:users`)

            // Доставляємо повідомлення локально тим користувачам, які підключені до цього сервера
            for (const [connId, userId] of this.connectionIdToUserId.entries()) {
                if (userIdsInRoom.has(userId)) {
                    // Якщо користувач, підключений до нас, знаходиться в цій кімнаті
                    const ws = this.connectionIdToWebSocketObject.get(connId)
                    if (ws) {
                        ws.send(`[${roomId}] ${message}`)
                        console.log(
                            `[Server ${this.serverId}] Надіслано локально ${connId} (${userId})`,
                        )
                    }
                }
            }
        })

        // Можна додати інші канали, наприклад для особистих повідомлень до конкретного користувача
        mockRedis.subscribe(`user:${this.serverId}:messages`, (messagePayload) => {
            const { userId, message } = JSON.parse(messagePayload)
            console.log(
                `[Server ${this.serverId}] Отримано особисте повідомлення для ${userId}: ${message}`,
            )
            // Доставляємо повідомлення всім локальним з'єднанням цього userId
            for (const [connId, currentUserId] of this.connectionIdToUserId.entries()) {
                if (currentUserId === userId) {
                    const ws = this.connectionIdToWebSocketObject.get(connId)
                    if (ws) {
                        ws.send(`[Особисте] ${message}`)
                        console.log(
                            `[Server ${this.serverId}] Надіслано особисте повідомлення локально ${connId} (${userId})`,
                        )
                    }
                }
            }
        })
    }

    /**
     * Реєструє нове WebSocket-з'єднання та асоціює його з користувачем.
     * @param {WebSocketConnection} ws - Об'єкт WebSocket-з'єднання.
     * @param {string} userId - ID користувача, що підключився.
     * @returns {string} Унікальний ID з'єднання, який був згенерований.
     */
    addConnection(ws, userId) {
        const connectionId = ws.id || crypto.randomUUID()
        ws.id = connectionId

        this.connectionIdToWebSocketObject.set(connectionId, ws)
        this.connectionIdToUserId.set(connectionId, userId)

        console.log(
            `[Server ${this.serverId}] Користувач ${userId} підключено з connectionId: ${connectionId}`,
        )
        return connectionId
    }

    /**
     * Видаляє WebSocket-з'єднання та оновлює локальний стан сервера.
     * @param {string} connectionId - Унікальний ID з'єднання, що відключилося.
     */
    removeConnection(connectionId) {
        const userId = this.connectionIdToUserId.get(connectionId)
        if (!userId) {
            console.warn(`[Server ${this.serverId}] connectionId ${connectionId} не знайдено.`)
            return
        }

        this.connectionIdToWebSocketObject.delete(connectionId)
        this.connectionIdToUserId.delete(connectionId)

        console.log(
            `[Server ${this.serverId}] connectionId ${connectionId} відключено для користувача ${userId}.`,
        )

        // Тут не видаляємо користувача з кімнат у Redis, оскільки він може мати інші з'єднання на інших серверах.
        // Це має бути оброблено на рівні "служби користувачів" або спеціальним механізмом "оффлайн".
    }

    /**
     * Додає користувача до кімнати в Redis.
     * @param {string} userId - ID користувача.
     * @param {string} roomId - ID кімнати.
     */
    async joinRoom(userId, roomId) {
        // Додаємо користувача до Set'у кімнати в Redis
        mockRedis.sadd(`room:${roomId}:users`, userId)
        // Додаємо кімнату до Set'у кімнат користувача в Redis (для зручності відключення)
        mockRedis.sadd(`user:${userId}:rooms`, roomId)
        console.log(
            `[Server ${this.serverId}] Користувач ${userId} приєднався до кімнати ${roomId} (Redis оновлено).`,
        )
    }

    /**
     * Видаляє користувача з кімнати в Redis.
     * @param {string} userId - ID користувача.
     * @param {string} roomId - ID кімнати.
     */
    async leaveRoom(userId, roomId) {
        // Видаляємо користувача з Set'у кімнати в Redis
        mockRedis.srem(`room:${roomId}:users`, userId)
        // Видаляємо кімнату з Set'у кімнат користувача в Redis
        mockRedis.srem(`user:${userId}:rooms`, roomId)
        console.log(
            `[Server ${this.serverId}] Користувач ${userId} покинув кімнату ${roomId} (Redis оновлено).`,
        )
    }

    /**
     * Надсилає повідомлення всім користувачам у певній кімнаті, використовуючи Redis Pub/Sub.
     * @param {string} roomId - ID кімнати.
     * @param {string} message - Повідомлення для відправки.
     */
    async sendMessageToRoom(roomId, message) {
        // Отримуємо всі ID користувачів у кімнаті з Redis
        const userIdsInRoom = mockRedis.smembers(`room:${roomId}:users`)
        if (userIdsInRoom.size === 0) {
            console.log(
                `[Server ${this.serverId}] Кімнату ${roomId} не знайдено або вона порожня в Redis.`,
            )
            return
        }

        console.log(
            `[Server ${this.serverId}] Публікуємо повідомлення для кімнати ${roomId} в Redis Pub/Sub.`,
        )
        // Публікуємо повідомлення в Redis Pub/Sub
        mockRedis.publish(
            'global:room:messages',
            JSON.stringify({
                roomId,
                message,
                userIds: Array.from(userIdsInRoom), // Можна передати список користувачів для оптимізації
                senderServerId: this.serverId,
            }),
        )
    }

    /**
     * Надсилає особисте повідомлення конкретному користувачеві.
     * У розподіленій системі це може бути складніше, оскільки невідомо, до якого сервера підключений користувач.
     * Простіший підхід: публікувати повідомлення для всіх серверів, і кожен сервер перевіряє, чи є у нього з'єднання з цим userId.
     * Більш складний: сервіс, що відстежує, на якому сервері знаходиться userId (наприклад, ще одна Redis-мапа `userId -> serverId`).
     * Для простоти прикладу, публікуємо на спеціальний канал, який кожен сервер обробляє.
     * @param {string} userId - ID користувача.
     * @param {string} message - Повідомлення для відправки.
     */
    async sendMessageToUser(userId, message) {
        // У реальному світі, можливо, ви б спочатку перевірили, до якого сервера підключений користувач.
        // Або, як тут, просто публікуєте повідомлення, і кожен сервер перевіряє свої локальні з'єднання.
        console.log(
            `[Server ${this.serverId}] Публікуємо особисте повідомлення для користувача ${userId} в Redis Pub/Sub.`,
        )
        mockRedis.publish(`user:${this.serverId}:messages`, JSON.stringify({ userId, message }))
    }
}

// --- Приклад використання (Масштабована архітектура) ---
/*
// Імітація WebSocket-з'єднання
class MockWebSocket {
    constructor(id) {
        this.id = id || crypto.randomUUID();
        this.messages = [];
    }
    send(message) {
        this.messages.push(message);
        // console.log(`[MockWS ${this.id}] Received: ${message}`);
    }
}

// Створюємо декілька екземплярів серверів
const server1 = new DistributedWebSocketServer("SERVER_1");
const server2 = new DistributedWebSocketServer("SERVER_2");

// Імітація підключень до різних серверів
const ws1_userA_s1 = new MockWebSocket(); // userA підключений до SERVER_1
const ws2_userA_s2 = new MockWebSocket(); // userA також підключений до SERVER_2
const ws1_userB_s1 = new MockWebSocket(); // userB підключений до SERVER_1

server1.addConnection(ws1_userA_s1, "userA");
server2.addConnection(ws2_userA_s2, "userA");
server1.addConnection(ws1_userB_s1, "userB");

// Користувачі приєднуються до кімнат (операції з Redis)
server1.joinRoom("userA", "chatRoom1"); // Оновлення Redis
server1.joinRoom("userB", "chatRoom1"); // Оновлення Redis
server2.joinRoom("userA", "privateRoom"); // Оновлення Redis

// Відправка повідомлень в кімнату
// Повідомлення надсилається з SERVER_1, але повинно дійти до обох з'єднань userA та ws1_userB_s1
server1.sendMessageToRoom("chatRoom1", "Повідомлення для всіх у chatRoom1!");

// Відправка особистого повідомлення (з SERVER_1 до userA, який також є на SERVER_2)
server1.sendMessageToUser("userA", "Особисте повідомлення для userA!");

console.log("\nПеревірка повідомлень:");
// Примітка: повідомлення можуть надходити асинхронно через імітацію Redis Pub/Sub
setTimeout(() => {
    console.log(`ws1_userA_s1 messages:`, ws1_userA_s1.messages);
    console.log(`ws2_userA_s2 messages:`, ws2_userA_s2.messages);
    console.log(`ws1_userB_s1 messages:`, ws1_userB_s1.messages);

    // Імітація відключення
    server1.removeConnection(ws1_userA_s1.id);
    server1.sendMessageToRoom("chatRoom1", "Ще одне повідомлення в chatRoom1 після відключення частини userA!");

    setTimeout(() => {
        console.log("\nПеревірка повідомлень після відключення:");
        console.log(`ws1_userA_s1 messages (після відключення):`, ws1_userA_s1.messages);
        console.log(`ws2_userA_s2 messages (після відключення):`, ws2_userA_s2.messages);
        console.log(`ws1_userB_s1 messages (після відключення):`, ws1_userB_s1.messages);
    }, 100);

}, 100);
*/
