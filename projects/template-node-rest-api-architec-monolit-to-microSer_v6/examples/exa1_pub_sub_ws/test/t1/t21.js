/**
 * @typedef {Object} WebSocketConnection
 * @property {string} id - Унікальний ідентифікатор з'єднання.
 * @property {function(string): void} send - Метод для відправки повідомлень клієнту.
 * // Можуть бути інші властивості
 */

// --- Імітація Redis (як і раніше) ---
// У реальному проекті це буде взаємодія з Redis-сервером через бібліотеку (наприклад, ioredis).
const mockRedisData = new Map()
const mockRedisPubSub = new Map()

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
    /**
     * @param {string} serverId - Унікальний ідентифікатор цього сервера.
     */
    constructor(serverId) {
        this.serverId = serverId

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

        this.setupRedisSubscribers()
    }

    /**
     * Генерує унікальний ID для кімнати, що включає простір імен.
     * @param {string} namespace - Простір імен (наприклад, '/chat', '/game').
     * @param {string} roomId - ID кімнати.
     * @returns {string} Комбінований ID кімнати у форматі "namespace:roomId".
     */
    _getCombinedRoomId(namespace, roomId) {
        return `${namespace}:${roomId}`
    }

    /**
     * Налаштовує підписки на Redis Pub/Sub для обробки міжсерверних повідомлень.
     */
    setupRedisSubscribers() {
        // Підписуємося на канал для повідомлень у кімнати (глобальний для всіх серверів)
        mockRedis.subscribe('global:room:messages', (messagePayload) => {
            const { combinedRoomId, message, senderServerId, userIds } = JSON.parse(messagePayload)
            // Ігноруємо повідомлення, які ми самі опублікували, щоб уникнути подвоєння обробки,
            // якщо не потрібне "відлуння" для відправника.
            // if (senderServerId === this.serverId) return;

            console.log(
                `[Server ${this.serverId}] Отримано повідомлення з Redis для кімнати ${combinedRoomId}: ${message}`,
            )

            // Для кожного користувача, який має бути в цій кімнаті
            for (const targetUserId of userIds) {
                // Перевіряємо, чи є цей користувач серед наших локальних з'єднань
                for (const [connId, userId] of this.connectionIdToUserId.entries()) {
                    if (userId === targetUserId) {
                        const ws = this.connectionIdToWebSocketObject.get(connId)
                        if (ws) {
                            ws.send(`[${combinedRoomId}] ${message}`)
                            console.log(
                                `[Server ${this.serverId}] Надіслано локально ${connId} (${userId})`,
                            )
                        }
                    }
                }
            }
        })

        // Канал для особистих повідомлень, якщо потрібно надсилати повідомлення конкретному користувачеві
        // незалежно від його кімнат. Кожен сервер отримує, якщо користувач підключений до нього.
        mockRedis.subscribe('global:user:messages', (messagePayload) => {
            const { targetUserId, message } = JSON.parse(messagePayload)
            console.log(
                `[Server ${this.serverId}] Отримано особисте повідомлення для ${targetUserId}: ${message}`,
            )

            for (const [connId, userId] of this.connectionIdToUserId.entries()) {
                if (userId === targetUserId) {
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
        // Це має бути оброблено на рівні "служби користувачів" або спеціальним механізмом "оффлайн" через окремий Redis ключ.
    }

    /**
     * Додає користувача до кімнати в межах простору імен, оновлюючи Redis.
     * @param {string} userId - ID користувача.
     * @param {string} namespace - Простір імен.
     * @param {string} roomId - ID кімнати.
     */
    async joinRoom(userId, namespace, roomId) {
        const combinedRoomId = this._getCombinedRoomId(namespace, roomId)
        mockRedis.sadd(`room:${combinedRoomId}:users`, userId)
        mockRedis.sadd(`user:${userId}:rooms`, combinedRoomId) // Зберігаємо для зручності
        console.log(
            `[Server ${this.serverId}] Користувач ${userId} приєднався до кімнати ${combinedRoomId} (Redis оновлено).`,
        )
    }

    /**
     * Видаляє користувача з кімнати в межах простору імен, оновлюючи Redis.
     * @param {string} userId - ID користувача.
     * @param {string} namespace - Простір імен.
     * @param {string} roomId - ID кімнати.
     */
    async leaveRoom(userId, namespace, roomId) {
        const combinedRoomId = this._getCombinedRoomId(namespace, roomId)
        mockRedis.srem(`room:${combinedRoomId}:users`, userId)
        mockRedis.srem(`user:${userId}:rooms`, combinedRoomId) // Видаляємо для зручності
        console.log(
            `[Server ${this.serverId}] Користувач ${userId} покинув кімнату ${combinedRoomId} (Redis оновлено).`,
        )
    }

    /**
     * Надсилає повідомлення всім користувачам у певній кімнаті в межах простору імен,
     * використовуючи Redis Pub/Sub.
     * @param {string} namespace - Простір імен.
     * @param {string} roomId - ID кімнати.
     * @param {string} message - Повідомлення для відправки.
     */
    async sendMessageToRoom(namespace, roomId, message) {
        const combinedRoomId = this._getCombinedRoomId(namespace, roomId)
        const userIdsInRoom = mockRedis.smembers(`room:${combinedRoomId}:users`)

        if (userIdsInRoom.size === 0) {
            console.log(
                `[Server ${this.serverId}] Кімнату ${combinedRoomId} не знайдено або вона порожня в Redis.`,
            )
            return
        }

        console.log(
            `[Server ${this.serverId}] Публікуємо повідомлення для кімнати ${combinedRoomId} в Redis Pub/Sub.`,
        )
        mockRedis.publish(
            'global:room:messages',
            JSON.stringify({
                combinedRoomId,
                message,
                userIds: Array.from(userIdsInRoom), // Надсилаємо список userIds для оптимізації
                senderServerId: this.serverId,
            }),
        )
    }

    /**
     * Надсилає особисте повідомлення конкретному користувачеві, використовуючи Redis Pub/Sub.
     * @param {string} userId - ID користувача.
     * @param {string} message - Повідомлення для відправки.
     */
    async sendMessageToUser(userId, message) {
        console.log(
            `[Server ${this.serverId}] Публікуємо особисте повідомлення для користувача ${userId} в Redis Pub/Sub.`,
        )
        mockRedis.publish('global:user:messages', JSON.stringify({ targetUserId: userId, message }))
    }
}

// --- Приклад використання (Масштабована архітектура з Namespaces) ---
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
server1.joinRoom("userA", "/chat", "general"); // Оновлення Redis
server1.joinRoom("userB", "/chat", "general"); // Оновлення Redis
server2.joinRoom("userA", "/game", "lobby"); // Оновлення Redis
server1.joinRoom("userB", "/game", "level1"); // Оновлення Redis

// Відправка повідомлень в кімнату (з SERVER_1)
server1.sendMessageToRoom("/chat", "general", "Привіт усім у загальному чаті!");
server1.sendMessageToRoom("/game", "lobby", "Гра починається!");
server2.sendMessageToRoom("/game", "level1", "Попереду рівень 1!");

// Відправка особистого повідомлення (з SERVER_1 до userA, який підключений до обох)
server1.sendMessageToUser("userA", "Особисте повідомлення для userA!");

console.log("\nПеревірка повідомлень (може бути затримка через setTimeout):");
setTimeout(() => {
    console.log(`ws1_userA_s1 messages:`, ws1_userA_s1.messages);
    console.log(`ws2_userA_s2 messages:`, ws2_userA_s2.messages);
    console.log(`ws1_userB_s1 messages:`, ws1_userB_s1.messages);

    // Імітація відключення
    server1.removeConnection(ws1_userA_s1.id);
    server2.leaveRoom("userA", "/game", "lobby"); // userA покидає ігрову кімнату

    server1.sendMessageToRoom("/chat", "general", "Повідомлення в чат після відключення частини userA!");
    server2.sendMessageToRoom("/game", "lobby", "Повідомлення в лобі після виходу userA!");

    setTimeout(() => {
        console.log("\nПеревірка повідомлень після відключення та виходу з кімнати:");
        console.log(`ws1_userA_s1 messages (після відключення):`, ws1_userA_s1.messages);
        console.log(`ws2_userA_s2 messages (після відключення):`, ws2_userA_s2.messages);
        console.log(`ws1_userB_s1 messages (після відключення):`, ws1_userB_s1.messages);
    }, 100);

}, 100);
*/
