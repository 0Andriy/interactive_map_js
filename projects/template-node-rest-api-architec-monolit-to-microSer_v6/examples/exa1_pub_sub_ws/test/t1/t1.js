/**
 * @typedef {Object} WebSocketConnection
 * @property {function(string): void} send - Метод для відправки повідомлень клієнту.
 * @property {string} id - Унікальний ідентифікатор з'єднання (генерується сервером).
 * // Можуть бути інші властивості, специфічні для вашої WebSocket-бібліотеки
 */

/**
 * Основний клас для управління станом WebSocket-сервера в монолітній архітектурі.
 */
class WebSocketStateManager {
    constructor() {
        /**
         * Зберігає посилання на самі локальні об'єкти WebSocket-з'єднань за їхніми унікальними ID
         * підключені до цього конкретного сервера.
         * Ключ: Унікальний ID з'єднання (string).
         * Значення: Об'єкт WebSocketConnection.
         * @type {Map<string, WebSocketConnection>}
         */
        this.connectionIdToWebSocketObject = new Map()

        /**
         * Дозволяє швидко знайти ID користувача за його локальних унікальним ID з'єднання.
         * Ключ: Унікальний ID з'єднання (string).
         * Значення: ID користувача (string).
         * @type {Map<string, string>}
         */
        this.connectionIdToUserId = new Map()

        /**
         * Зберігає всі активні WebSocket-з'єднання для кожного користувача (глобальний).
         * Ключ: ID користувача (string).
         * Значення: Набір унікальних ID з'єднань (Set<string>), що належать цьому користувачу.
         * @type {Map<string, Set<string>>}
         */
        this.userIdToConnectionIds = new Map()

        /**
         * Зберігає всі активні WebSocket-з'єднання для кожного користувача (локальний).
         * Ключ: ID користувача (string).
         * Значення: Набір унікальних ID з'єднань (Set<string>), що належать цьому користувачу.
         * @type {Map<string, Set<string>>}
         */
        this.userIdToLocalConnectionIds = new Map()

        /**
         * Зберігає, які користувачі (за їхнім userId) знаходяться в кожній кімнаті (глобальний).
         * Ключ: ID кімнати (string).
         * Значення: Набір ID користувачів (Set<string>), які перебувають у цій кімнаті.
         * @type {Map<string, Set<string>>}
         */
        this.roomIdToUserIds = new Map()

        /**
         * Дозволяє швидко знайти всі кімнати, в яких перебуває певний користувач (глобальний).
         * Опціонально, але корисно для видалення користувача з кімнат при відключенні.
         * Ключ: ID користувача (string).
         * Значення: Набір ID кімнат (Set<string>), в яких перебуває цей користувач.
         * @type {Map<string, Set<string>>}
         */
        this.userIdToRoomIds = new Map()
    }

    /**
     * Реєструє нове WebSocket-з'єднання та асоціює його з користувачем.
     * @param {WebSocketConnection} ws - Об'єкт WebSocket-з'єднання.
     * @param {string} userId - ID користувача, що підключився.
     * @returns {string} Унікальний ID з'єднання, який був згенерований.
     */
    addConnection(ws, userId) {
        // Генеруємо унікальний ID для цього з'єднання
        const connectionId = ws.id || crypto.randomUUID() // Припускаємо, що ws може вже мати id, або генеруємо новий
        ws.id = connectionId // Присвоюємо з'єднанню його id

        // Зберігаємо посилання на об'єкт з'єднання
        this.connectionIdToWebSocketObject.set(connectionId, ws)

        // Зберігаємо зв'язок connectionId <-> userId
        this.connectionIdToUserId.set(connectionId, userId)

        // Додаємо connectionId до набору з'єднань для цього userId
        if (!this.userIdToConnectionIds.has(userId)) {
            this.userIdToConnectionIds.set(userId, new Set())
        }
        this.userIdToConnectionIds.get(userId).add(connectionId)

        console.log(`[Моноліт] Користувач ${userId} підключено з connectionId: ${connectionId}`)
        return connectionId
    }

    /**
     * Видаляє WebSocket-з'єднання та оновлює стан.
     * @param {string} connectionId - Унікальний ID з'єднання, що відключилося.
     */
    removeConnection(connectionId) {
        const userId = this.connectionIdToUserId.get(connectionId)
        if (!userId) {
            console.warn(`[Моноліт] connectionId ${connectionId} не знайдено.`)
            return
        }

        // Видаляємо з'єднання з мапи об'єктів
        this.connectionIdToWebSocketObject.delete(connectionId)
        // Видаляємо зв'язок connectionId <-> userId
        this.connectionIdToUserId.delete(connectionId)

        // Видаляємо connectionId з набору з'єднань для цього userId
        const userConnections = this.userIdToConnectionIds.get(userId)
        if (userConnections) {
            userConnections.delete(connectionId)
            if (userConnections.size === 0) {
                // Якщо у користувача більше немає активних з'єднань, видаляємо його повністю
                this.userIdToConnectionIds.delete(userId)
                console.log(`[Моноліт] Користувач ${userId} повністю відключився.`)

                // Додатково: Видалення користувача з усіх кімнат, якщо він повністю офлайн
                const userRooms = this.userIdToRoomIds.get(userId)
                if (userRooms) {
                    for (const roomId of userRooms) {
                        const roomUsers = this.roomIdToUserIds.get(roomId)
                        if (roomUsers) {
                            roomUsers.delete(userId)
                            if (roomUsers.size === 0) {
                                this.roomIdToUserIds.delete(roomId)
                                console.log(`[Моноліт] Кімната ${roomId} тепер порожня.`)
                            }
                        }
                    }
                    this.userIdToRoomIds.delete(userId)
                }
            }
        }
        console.log(`[Моноліт] connectionId ${connectionId} відключено для користувача ${userId}.`)
    }

    /**
     * Додає користувача до кімнати.
     * @param {string} userId - ID користувача.
     * @param {string} roomId - ID кімнати.
     */
    joinRoom(userId, roomId) {
        // Додаємо користувача до кімнати
        if (!this.roomIdToUserIds.has(roomId)) {
            this.roomIdToUserIds.set(roomId, new Set())
        }
        this.roomIdToUserIds.get(roomId).add(userId)

        // Додаємо кімнату до списку кімнат користувача
        if (!this.userIdToRoomIds.has(userId)) {
            this.userIdToRoomIds.set(userId, new Set())
        }
        this.userIdToRoomIds.get(userId).add(roomId)

        console.log(`[Моноліт] Користувач ${userId} приєднався до кімнати ${roomId}.`)
    }

    /**
     * Видаляє користувача з кімнати.
     * @param {string} userId - ID користувача.
     * @param {string} roomId - ID кімнати.
     */
    leaveRoom(userId, roomId) {
        const roomUsers = this.roomIdToUserIds.get(roomId)
        if (roomUsers) {
            roomUsers.delete(userId)
            if (roomUsers.size === 0) {
                this.roomIdToUserIds.delete(roomId)
                console.log(`[Моноліт] Кімната ${roomId} тепер порожня.`)
            }
        }

        const userRooms = this.userIdToRoomIds.get(userId)
        if (userRooms) {
            userRooms.delete(roomId)
            if (userRooms.size === 0) {
                this.userIdToRoomIds.delete(userId)
                console.log(`[Моноліт] Користувач ${userId} не перебуває в жодній кімнаті.`)
            }
        }
        console.log(`[Моноліт] Користувач ${userId} покинув кімнату ${roomId}.`)
    }

    /**
     * Надсилає повідомлення всім з'єднанням певного користувача.
     * @param {string} userId - ID користувача.
     * @param {string} message - Повідомлення для відправки.
     */
    sendMessageToUser(userId, message) {
        const connectionIds = this.userIdToConnectionIds.get(userId)
        if (connectionIds) {
            console.log(
                `[Моноліт] Надсилаємо повідомлення користувачу ${userId} (${connectionIds.size} з'єднань): ${message}`,
            )
            for (const connectionId of connectionIds) {
                const ws = this.connectionIdToWebSocketObject.get(connectionId)
                if (ws) {
                    ws.send(message)
                } else {
                    console.warn(
                        `[Моноліт] Не знайдено WebSocket-об'єкт для connectionId: ${connectionId}`,
                    )
                }
            }
        } else {
            console.log(`[Моноліт] Користувач ${userId} не має активних з'єднань.`)
        }
    }

    /**
     * Надсилає повідомлення всім користувачам у певній кімнаті.
     * @param {string} roomId - ID кімнати.
     * @param {string} message - Повідомлення для відправки.
     */
    sendMessageToRoom(roomId, message) {
        const userIdsInRoom = this.roomIdToUserIds.get(roomId)
        if (userIdsInRoom) {
            console.log(
                `[Моноліт] Надсилаємо повідомлення в кімнату ${roomId} (${userIdsInRoom.size} користувачів): ${message}`,
            )
            for (const userId of userIdsInRoom) {
                this.sendMessageToUser(userId, message) // Використовуємо функцію відправки користувачу
            }
        } else {
            console.log(`[Моноліт] Кімнату ${roomId} не знайдено або вона порожня.`)
        }
    }
}

// --- Приклад використання (Монолітна архітектура) ---
/*
// Припустимо, у нас є проста імітація WebSocket-з'єднання
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

const stateManager = new WebSocketStateManager();

// Імітація підключень
const ws1_userA = new MockWebSocket();
const ws2_userA = new MockWebSocket(); // Друга вкладка/пристрій для userA
const ws1_userB = new MockWebSocket();

stateManager.addConnection(ws1_userA, "userA");
stateManager.addConnection(ws2_userA, "userA");
stateManager.addConnection(ws1_userB, "userB");

// Користувачі приєднуються до кімнат
stateManager.joinRoom("userA", "chatRoom1");
stateManager.joinRoom("userB", "chatRoom1");
stateManager.joinRoom("userA", "privateRoom"); // userA в кількох кімнатах

// Відправка повідомлень
stateManager.sendMessageToUser("userA", "Привіт, userA! (особисте)");
stateManager.sendMessageToRoom("chatRoom1", "Повідомлення для всіх у chatRoom1!");

console.log("\nПеревірка повідомлень:");
console.log(`ws1_userA messages: ${ws1_userA.messages}`);
console.log(`ws2_userA messages: ${ws2_userA.messages}`);
console.log(`ws1_userB messages: ${ws1_userB.messages}`);

// Відключення з'єднання
stateManager.removeConnection(ws1_userA.id);
stateManager.sendMessageToUser("userA", "Привіт, userA! (після відключення одного з'єднання)");

stateManager.removeConnection(ws2_userA.id); // Останнє з'єднання userA
stateManager.sendMessageToRoom("chatRoom1", "Повідомлення для chatRoom1 після відключення userA");

console.log("\nПеревірка повідомлень після відключення:");
console.log(`ws1_userA messages (після відключення): ${ws1_userA.messages}`);
console.log(`ws2_userA messages (після відключення): ${ws2_userA.messages}`);
console.log(`ws1_userB messages (після відключення): ${ws1_userB.messages}`);
*/
