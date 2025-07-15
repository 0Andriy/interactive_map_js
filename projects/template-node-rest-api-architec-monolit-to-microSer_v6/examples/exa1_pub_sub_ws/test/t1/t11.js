/**
 * @typedef {Object} WebSocketConnection
 * @property {string} id - Унікальний ідентифікатор з'єднання (генерується сервером).
 * @property {function(string): void} send - Метод для відправки повідомлень клієнту.
 * // Можуть бути інші властивості, специфічні для вашої WebSocket-бібліотеки
 */

/**
 * Основний клас для управління станом WebSocket-сервера, включаючи кімнати та простори імен.
 * Призначений для використання в монолітній архітектурі.
 */
class WebSocketStateManager {
    constructor() {
        /**
         * Зберігає посилання на самі об'єкти WebSocket-з'єднань за їхніми унікальними ID.
         * Ключ: Унікальний ID з'єднання (string).
         * Значення: Об'єкт WebSocketConnection.
         * @type {Map<string, WebSocketConnection>}
         */
        this.connectionIdToWebSocketObject = new Map()

        /**
         * Зв'язує унікальний ID з'єднання з ID користувача.
         * Ключ: Унікальний ID з'єднання (string).
         * Значення: ID користувача (string).
         * @type {Map<string, string>}
         */
        this.connectionIdToUserId = new Map()

        /**
         * Зберігає всі активні унікальні ID з'єднань для кожного користувача.
         * Ключ: ID користувача (string).
         * Значення: Набір унікальних ID з'єднань (Set<string>), що належать цьому користувачу.
         * @type {Map<string, Set<string>>}
         */
        this.userIdToConnectionIds = new Map()

        /**
         * Зберігає, які користувачі (за їхнім userId) знаходяться в кожній кімнаті в межах певного простору імен.
         * Ключ: Комбінований ID кімнати "namespace:roomId" (string).
         * Значення: Набір ID користувачів (Set<string>), які перебувають у цій кімнаті.
         * @type {Map<string, Set<string>>}
         */
        this.roomToUserIds = new Map()

        /**
         * Дозволяє швидко знайти всі кімнати (з простором імен), в яких перебуває певний користувач.
         * Ключ: ID користувача (string).
         * Значення: Набір комбінованих ID кімнат "namespace:roomId" (Set<string>), в яких перебуває цей користувач.
         * @type {Map<string, Set<string>>}
         */
        this.userIdToRooms = new Map()
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

        this.connectionIdToWebSocketObject.delete(connectionId)
        this.connectionIdToUserId.delete(connectionId)

        const userConnections = this.userIdToConnectionIds.get(userId)
        if (userConnections) {
            userConnections.delete(connectionId)
            if (userConnections.size === 0) {
                this.userIdToConnectionIds.delete(userId)
                console.log(`[Моноліт] Користувач ${userId} повністю відключився.`)

                // Якщо користувач повністю офлайн, видаляємо його з усіх кімнат
                const userRooms = this.userIdToRooms.get(userId)
                if (userRooms) {
                    for (const combinedRoomId of userRooms) {
                        const roomUsers = this.roomToUserIds.get(combinedRoomId)
                        if (roomUsers) {
                            roomUsers.delete(userId)
                            if (roomUsers.size === 0) {
                                this.roomToUserIds.delete(combinedRoomId)
                                console.log(`[Моноліт] Кімната ${combinedRoomId} тепер порожня.`)
                            }
                        }
                    }
                    this.userIdToRooms.delete(userId)
                }
            }
        }
        console.log(`[Моноліт] connectionId ${connectionId} відключено для користувача ${userId}.`)
    }

    /**
     * Додає користувача до кімнати в межах простору імен.
     * @param {string} userId - ID користувача.
     * @param {string} namespace - Простір імен.
     * @param {string} roomId - ID кімнати.
     */
    joinRoom(userId, namespace, roomId) {
        const combinedRoomId = this._getCombinedRoomId(namespace, roomId)

        if (!this.roomToUserIds.has(combinedRoomId)) {
            this.roomToUserIds.set(combinedRoomId, new Set())
        }
        this.roomToUserIds.get(combinedRoomId).add(userId)

        if (!this.userIdToRooms.has(userId)) {
            this.userIdToRooms.set(userId, new Set())
        }
        this.userIdToRooms.get(userId).add(combinedRoomId)

        console.log(`[Моноліт] Користувач ${userId} приєднався до кімнати ${combinedRoomId}.`)
    }

    /**
     * Видаляє користувача з кімнати в межах простору імен.
     * @param {string} userId - ID користувача.
     * @param {string} namespace - Простір імен.
     * @param {string} roomId - ID кімнати.
     */
    leaveRoom(userId, namespace, roomId) {
        const combinedRoomId = this._getCombinedRoomId(namespace, roomId)

        const roomUsers = this.roomToUserIds.get(combinedRoomId)
        if (roomUsers) {
            roomUsers.delete(userId)
            if (roomUsers.size === 0) {
                this.roomToUserIds.delete(combinedRoomId)
                console.log(`[Моноліт] Кімната ${combinedRoomId} тепер порожня.`)
            }
        }

        const userRooms = this.userIdToRooms.get(userId)
        if (userRooms) {
            userRooms.delete(combinedRoomId)
            if (userRooms.size === 0) {
                this.userIdToRooms.delete(userId)
                console.log(`[Моноліт] Користувач ${userId} не перебуває в жодній кімнаті.`)
            }
        }
        console.log(`[Моноліт] Користувач ${userId} покинув кімнату ${combinedRoomId}.`)
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
     * Надсилає повідомлення всім користувачам у певній кімнаті в межах простору імен.
     * @param {string} namespace - Простір імен.
     * @param {string} roomId - ID кімнати.
     * @param {string} message - Повідомлення для відправки.
     */
    sendMessageToRoom(namespace, roomId, message) {
        const combinedRoomId = this._getCombinedRoomId(namespace, roomId)
        const userIdsInRoom = this.roomToUserIds.get(combinedRoomId)

        if (userIdsInRoom) {
            console.log(
                `[Моноліт] Надсилаємо повідомлення в кімнату ${combinedRoomId} (${userIdsInRoom.size} користувачів): ${message}`,
            )
            for (const userId of userIdsInRoom) {
                this.sendMessageToUser(userId, message)
            }
        } else {
            console.log(`[Моноліт] Кімнату ${combinedRoomId} не знайдено або вона порожня.`)
        }
    }
}

// --- Приклад використання (Монолітна архітектура з Namespaces) ---
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

const ws1_userA = new MockWebSocket();
const ws2_userA = new MockWebSocket();
const ws1_userB = new MockWebSocket();

stateManager.addConnection(ws1_userA, "userA");
stateManager.addConnection(ws2_userA, "userA");
stateManager.addConnection(ws1_userB, "userB");

// Користувачі приєднуються до кімнат у різних просторах імен
stateManager.joinRoom("userA", "/chat", "general");
stateManager.joinRoom("userB", "/chat", "general");
stateManager.joinRoom("userA", "/game", "lobby"); // userA в грі
stateManager.joinRoom("userB", "/game", "level1"); // userB в іншій ігровій кімнаті

// Відправка повідомлень у кімнати
stateManager.sendMessageToRoom("/chat", "general", "Привіт усім у загальному чаті!");
stateManager.sendMessageToRoom("/game", "lobby", "Гра починається!");
stateManager.sendMessageToRoom("/game", "level1", "Попереду рівень 1!");

console.log("\nПеревірка повідомлень:");
console.log(`ws1_userA messages:`, ws1_userA.messages);
console.log(`ws2_userA messages:`, ws2_userA.messages);
console.log(`ws1_userB messages:`, ws1_userB.messages);

// userA покидає одну кімнату чату
stateManager.leaveRoom("userA", "/chat", "general");
stateManager.sendMessageToRoom("/chat", "general", "Ще одне повідомлення в загальному чаті.");

console.log("\nПеревірка повідомлень після виходу з кімнати:");
console.log(`ws1_userA messages (після виходу):`, ws1_userA.messages);
console.log(`ws2_userA messages (після виходу):`, ws2_userA.messages); // Все ще отримує повідомлення, оскільки userA має два з'єднання.
console.log(`ws1_userB messages (після виходу):`, ws1_userB.messages);
*/
