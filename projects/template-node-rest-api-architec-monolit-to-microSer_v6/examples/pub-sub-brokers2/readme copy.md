// DatabaseAdapter.js (оновлений)
class DatabaseAdapter {
    /**
     * Зберігає повідомлення в БД.
     * @param {string} roomId
     * @param {string} userId
     * @param {string} text
     * @returns {Promise<object>} Збережене повідомлення з ID та часом
     */
    async saveMessage(roomId, userId, text) {
        throw new Error("Метод saveMessage має бути реалізований.");
    }

    /**
     * Реєструє клієнта як присутнього в кімнаті.
     * @param {string} connectionId - Унікальний ID з'єднання.
     * @param {string} namespace - Простір імен.
     * @param {string} roomName - Назва кімнати.
     * @param {number} ttl - Час життя запису (для автоматичного очищення).
     * @returns {Promise<void>}
     */
    async joinPresence(connectionId, namespace, roomName, ttl = 300) {
        throw new Error("Метод joinPresence має бути реалізований.");
    }

    /**
     * Видаляє клієнта зі списку присутніх.
     * @param {string} connectionId - Унікальний ID з'єднання.
     * @returns {Promise<void>}
     */
    async leavePresence(connectionId) {
        throw new Error("Метод leavePresence має бути реалізований.");
    }

    /**
     * Отримує загальну кількість присутніх у кімнаті.
     * @param {string} namespace - Простір імен.
     * @param {string} roomName - Назва кімнати.
     * @returns {Promise<number>} Загальна кількість клієнтів.
     */
    async getRoomOccupancy(namespace, roomName) {
        throw new Error("Метод getRoomOccupancy має бути реалізований.");
    }
}




// WebSocketNamespace.js (Фрагмент змін)

class WebSocketNamespace {
    // ... інші поля ...
    #dbAdapter; // Нове поле

    constructor(name, allConnections, logger = null, pubSubBroker = null, serverInstanceId = null, dbAdapter = null) {
        // ... ініціалізація інших полів ...
        this.#dbAdapter = dbAdapter; // Зберігаємо адаптер
        // ...
    }

    // Додаємо публічний метод для використання адаптера із зовнішніх обробників
    get db() {
        return this.#dbAdapter;
    }

    // ... інші методи ...
}

export default WebSocketNamespace;



// server.js (Приклад використання адаптера БД)

// 1. Імітація адаптера БД (замінити на реальну реалізацію)
const myDbAdapter = {
    async saveMessage(roomId, userId, text) {
        console.log(`[DB] Зберігання повідомлення в кімнаті ${roomId} від користувача ${userId}: "${text}"`);
        // await реальний запит до БД тут
        return { id: Date.now(), roomId, userId, text, timestamp: new Date() };
    }
};

// 2. Оновлення обробника чату
const chatNamespaceHandler = async (chatNS, connection, type, payload) => { // ОБОВ'ЯЗКОВО async тут
    switch (type) {
        // ...
        case 'SEND_MESSAGE':
            const targetRoom = payload.roomName || 'general';

            // >>>>> СИНХРОНІЗАЦІЯ ГЛОБАЛЬНОГО СТАНУ: Запис у БД <<<<<
            // Використовуємо адаптер, отриманий через ns.db
            const savedMessage = await chatNS.db.saveMessage(
                targetRoom,
                connection.getUserId(),
                payload.text
            );

            // Після успішного збереження в БД (глобальний стан узгоджено):
            const messagePayload = {
                // Використовуємо дані, повернені з БД
                type: 'NEW_MESSAGE',
                id: savedMessage.id,
                user: savedMessage.userId,
                text: savedMessage.text,
                timestamp: savedMessage.timestamp
            };

            // Розсилка локально та через Redis (як було раніше)
            chatNS.broadcastToRoom(targetRoom, JSON.stringify(messagePayload), connection.id);
            await chatNS.publishToBroker(targetRoom, messagePayload, connection.id);
            break;
    }
};

// 3. Конфігурація менеджера
const serverConfig = {
    // ...
    dbAdapter: myDbAdapter, // Передаємо адаптер
    // ...
};


<!--  -->

// WsServerManager.js (Фрагмент змін)

    /**
     * Обробляє закриття WebSocket-з'єднання.
     * @private
     * @param {string} connectionId - ID закриваного з'єднання.
     */
    #handleClose = async (connectionId) => { // ОБОВ'ЯЗКОВО async тут
        this.#logger.info(`З'єднання закривається: ${connectionId}`);
        const connection = this.#connections.get(connectionId);

        if (connection) {
            // >>>>> СИНХРОНІЗАЦІЯ СТАНУ ПРИСУТНОСТІ: Видалення з БД <<<<<
            await this.#dbAdapter.leavePresence(connectionId);

            // ... (решта логіки локального видалення) ...
            this.#namespaces.forEach(ns => {
                connection.leaveNamespace(ns.name);
            });
            this.#connections.delete(connectionId);
        }
    };




// WebSocketNamespace.js (Фрагмент змін)

    /**
     * Додає з'єднання до кімнати в цьому просторі імен та синхронізує присутність у БД.
     * @param {string} roomName - Назва кімнати.
     * @param {string} connectionId - ID з'єднання.
     */
    async joinRoom(roomName, connectionId) { // ОБОВ'ЯЗКОВО async тут
        // ... (існуюча локальна логіка joinRoom) ...
        if (!this.#rooms.has(roomName)) { /* ... */ }
        const room = this.#rooms.get(roomName);
        room.addConnection(connectionId);
        // ... (оновлення connection.joinRoom) ...

        // >>>>> СИНХРОНІЗАЦІЯ СТАНУ ПРИСУТНОСТІ: Додавання в БД <<<<<
        // Використовуємо TTL 5 хвилин. Heartbeat має оновлювати цей запис,
        // щоб він не зник, поки клієнт активний.
        await this.#dbAdapter.joinPresence(connectionId, this.name, roomName, 300);

        this.#logger?.info(`З'єднання ${connectionId} приєдналося до кімнати ${roomName} у ПІ ${this.name} (синхронізовано).`);
    }
