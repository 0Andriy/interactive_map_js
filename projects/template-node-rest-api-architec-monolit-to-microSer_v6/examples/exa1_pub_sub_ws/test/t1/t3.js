// src/WebSocketManager.js

const crypto = require('crypto')

/**
 * @typedef {import('./utils/types').WebSocketConnection} WebSocketConnection
 * @typedef {import('./interfaces/IPubSub')} IPubSub
 * @typedef {import('./interfaces/IStorage')} IStorage
 */

/**
 * Універсальний менеджер WebSocket-з'єднань, що працює з концепціями кімнат та просторів імен.
 * Цей менеджер абстрагується від конкретної реалізації Pub/Sub та Storage,
 * використовуючи інтерфейси IPubSub та IStorage.
 */
class WebSocketManager {
    /**
     * @param {string} serverId - Унікальний ідентифікатор цього сервера.
     * @param {IPubSub} pubSubClient - Реалізація IPubSub.
     * @param {IStorage} storageClient - Реалізація IStorage.
     */
    constructor(serverId, pubSubClient, storageClient) {
        this.serverId = serverId
        this.pubSub = pubSubClient
        this.storage = storageClient

        /**
         * Локальне сховище для з'єднань, підключених до *цього* сервера.
         * @type {Map<string, WebSocketConnection>}
         */
        this.connectionIdToWebSocketObject = new Map()
        /**
         * Локальне сховище для відображення connectionId на userId.
         * @type {Map<string, string>}
         */
        this.connectionIdToUserId = new Map()
        /**
         * Локальне сховище для відображення userId на *локальні* connectionIds.
         * Це потрібно, щоб надсилати повідомлення всім з'єднанням користувача, підключених до *цього* сервера.
         * @type {Map<string, Set<string>>}
         */
        this.userIdToLocalConnectionIds = new Map()
    }

    /**
     * Генерує унікальний ID для кімнати, що включає простір імен.
     * Цей метод є внутрішнім для менеджера і визначає, як "кімнати" зберігаються в сховищі.
     * @param {string} namespace - Простір імен (наприклад, 'chat', 'game').
     * @param {string} roomId - ID кімнати (наприклад, 'general', 'lobby').
     * @returns {string} Комбінований ключ кімнати у форматі "namespace:roomId".
     */
    _getCombinedRoomKey(namespace, roomId) {
        return `room:${namespace}:${roomId}`
    }

    /**
     * Генерує ключ для зберігання кімнат, в яких перебуває користувач.
     * @param {string} userId - ID користувача.
     * @returns {string} Ключ у форматі "user:userId:rooms".
     */
    _getUserRoomsKey(userId) {
        return `user:${userId}:rooms`
    }

    /**
     * Реєструє нове WebSocket-з'єднання та асоціює його з користувачем.
     * Ця операція є локальною для цього сервера.
     * @param {WebSocketConnection} ws - Об'єкт WebSocket-з'єднання.
     * @param {string} userId - ID користувача, що підключився.
     * @returns {string} Унікальний ID з'єднання, який був згенерований.
     */
    addConnection(ws, userId) {
        const connectionId = ws.id || crypto.randomUUID()
        ws.id = connectionId

        this.connectionIdToWebSocketObject.set(connectionId, ws)
        this.connectionIdToUserId.set(connectionId, userId)

        // Додаємо з'єднання до локального набору з'єднань для цього користувача
        let userLocalConnections = this.userIdToLocalConnectionIds.get(userId)
        if (!userLocalConnections) {
            userLocalConnections = new Set()
            this.userIdToLocalConnectionIds.set(userId, userLocalConnections)
        }
        userLocalConnections.add(connectionId)

        console.log(
            `[WebSocketManager:${this.serverId}] Користувач ${userId} підключено з connectionId: ${connectionId}`,
        )
        return connectionId
    }

    /**
     * Видаляє WebSocket-з'єднання та оновлює локальний стан сервера.
     * Якщо користувач повністю відключився від *усіх* серверів, ця логіка повинна бути
     * керована зовнішньою системою (наприклад, сервісом присутності), яка оновлює загальний стан.
     * @param {string} connectionId - Унікальний ID з'єднання, що відключилося.
     */
    async removeConnection(connectionId) {
        const userId = this.connectionIdToUserId.get(connectionId)
        if (!userId) {
            console.warn(
                `[WebSocketManager:${this.serverId}] connectionId ${connectionId} не знайдено.`,
            )
            return
        }

        this.connectionIdToWebSocketObject.delete(connectionId)
        this.connectionIdToUserId.delete(connectionId)

        const userLocalConnections = this.userIdToLocalConnectionIds.get(userId)
        if (userLocalConnections) {
            userLocalConnections.delete(connectionId)
            if (userLocalConnections.size === 0) {
                this.userIdToLocalConnectionIds.delete(userId)
                console.log(
                    `[WebSocketManager:${this.serverId}] Користувач ${userId} більше не має активних з'єднань на цьому сервері.`,
                )
                // Тут можна було б ініціювати перевірку "глобального" відключення користувача,
                // але це більш складна логіка, що виходить за рамки цього прикладу.
            }
        }
        console.log(
            `[WebSocketManager:${this.serverId}] connectionId ${connectionId} відключено для користувача ${userId}.`,
        )
    }

    /**
     * Додає користувача до кімнати в межах простору імен, оновлюючи центральне сховище.
     * Це операція, що впливає на глобальний стан (через IStorage).
     * @param {string} userId - ID користувача.
     * @param {string} namespace - Простір імен.
     * @param {string} roomId - ID кімнати.
     */
    async joinRoom(userId, namespace, roomId) {
        const combinedRoomKey = this._getCombinedRoomKey(namespace, roomId)
        const userRoomsKey = this._getUserRoomsKey(userId)

        await this.storage.addToSet(`${combinedRoomKey}:users`, userId)
        await this.storage.addToSet(userRoomsKey, combinedRoomKey) // Користувач тепер у цій кімнаті

        console.log(
            `[WebSocketManager:${this.serverId}] Користувач ${userId} приєднався до кімнати ${combinedRoomKey} (сховище оновлено).`,
        )
    }

    /**
     * Видаляє користувача з кімнати в межах простору імен, оновлюючи центральне сховище.
     * @param {string} userId - ID користувача.
     * @param {string} namespace - Простір імен.
     * @param {string} roomId - ID кімнати.
     */
    async leaveRoom(userId, namespace, roomId) {
        const combinedRoomKey = this._getCombinedRoomKey(namespace, roomId)
        const userRoomsKey = this._getUserRoomsKey(userId)

        await this.storage.removeFromSet(`${combinedRoomKey}:users`, userId)
        await this.storage.removeFromSet(userRoomsKey, combinedRoomKey)

        const roomUsersCount = await this.storage.getSetSize(`${combinedRoomKey}:users`)
        if (roomUsersCount === 0) {
            await this.storage.delete(`${combinedRoomKey}:users`)
            console.log(
                `[WebSocketManager:${this.serverId}] Кімната ${combinedRoomKey} тепер порожня.`,
            )
        }

        const userRoomCount = await this.storage.getSetSize(userRoomsKey)
        if (userRoomCount === 0) {
            await this.storage.delete(userRoomsKey)
            console.log(
                `[WebSocketManager:${this.serverId}] Користувач ${userId} більше не перебуває в жодній кімнаті.`,
            )
        }
        console.log(
            `[WebSocketManager:${this.serverId}] Користувач ${userId} покинув кімнату ${combinedRoomKey} (сховище оновлено).`,
        )
    }

    /**
     * Надсилає повідомлення *всім активним з'єднанням* певного користувача
     * (навіть якщо вони підключені до інших серверів).
     * Для цього використовується Pub/Sub.
     * @param {string} userId - ID користувача.
     * @param {string} message - Повідомлення для відправки.
     */
    async sendMessageToUser(userId, message) {
        // Ми публікуємо повідомлення в Pub/Sub, і кожен сервер, який отримає його,
        // перевірить, чи цей користувач підключений до нього.
        console.log(
            `[WebSocketManager:${this.serverId}] Публікуємо особисте повідомлення для користувача ${userId} у Pub/Sub.`,
        )
        await this.pubSub.publish(
            'global:user:messages',
            JSON.stringify({ targetUserId: userId, message }),
        )
    }

    /**
     * Надсилає повідомлення всім користувачам у певній кімнаті в межах простору імен.
     * Процес:
     * 1. Отримуємо список userIds з центрального сховища (IStorage).
     * 2. Публікуємо повідомлення в Pub/Sub канал, вказавши ці userIds.
     * 3. Кожен WebSocketManager (на кожному сервері) слухає цей канал.
     * 4. Отримавши повідомлення, він перевіряє, чи є userIds з повідомлення серед його локальних з'єднань.
     * 5. Якщо є, надсилає повідомлення відповідним локальним з'єднанням.
     * @param {string} namespace - Простір імен.
     * @param {string} roomId - ID кімнати.
     * @param {string} message - Повідомлення для відправки.
     */
    async sendMessageToRoom(namespace, roomId, message) {
        const combinedRoomKey = this._getCombinedRoomKey(namespace, roomId)
        const userIdsInRoom = await this.storage.getSetMembers(`${combinedRoomKey}:users`)

        if (userIdsInRoom.size > 0) {
            console.log(
                `[WebSocketManager:${this.serverId}] Публікуємо повідомлення для кімнати ${combinedRoomKey} у Pub/Sub.`,
            )
            await this.pubSub.publish(
                'global:room:messages',
                JSON.stringify({
                    combinedRoomKey,
                    message,
                    userIds: Array.from(userIdsInRoom),
                    senderServerId: this.serverId, // Додаємо ID сервера-відправника для уникнення "відлуння"
                }),
            )
        } else {
            console.log(
                `[WebSocketManager:${this.serverId}] Кімнату ${combinedRoomKey} не знайдено або вона порожня.`,
            )
        }
    }

    /**
     * Ініціалізує менеджер: підключається до Pub/Sub та Storage,
     * а також налаштовує слухачів для міжсерверної комунікації.
     */
    async init() {
        await this.pubSub.connect()
        await this.storage.connect()

        // Підписуємося на канали для обробки міжсерверних повідомлень.
        // Кожен менеджер слухає ці канали.
        this.pubSub.subscribe('global:room:messages', (messagePayload) => {
            const { combinedRoomKey, message, userIds, senderServerId } = JSON.parse(messagePayload)

            // Опціонально: Пропускаємо повідомлення, які ми самі опублікували,
            // якщо не потрібно, щоб відправник отримував "відлуння" свого повідомлення.
            if (senderServerId === this.serverId) {
                // console.log(`[WebSocketManager:${this.serverId}] Пропускаю власне повідомлення для ${combinedRoomKey}.`);
                return
            }

            console.log(
                `[WebSocketManager:${this.serverId}] Обробка повідомлення з PubSub для кімнати ${combinedRoomKey}: ${message}`,
            )
            for (const targetUserId of userIds) {
                // Якщо цільовий користувач підключений до ЦЬОГО сервера, надсилаємо йому повідомлення.
                // Ми використовуємо локальний userIdToLocalConnectionIds для швидкого доступу.
                const localConnectionIds = this.userIdToLocalConnectionIds.get(targetUserId)
                if (localConnectionIds) {
                    for (const connId of localConnectionIds) {
                        const ws = this.connectionIdToWebSocketObject.get(connId)
                        if (ws) {
                            ws.send(`[${combinedRoomKey}] ${message}`)
                            console.log(
                                `[WebSocketManager:${this.serverId}] Надіслано локально ${connId} (${targetUserId})`,
                            )
                        }
                    }
                }
            }
        })

        this.pubSub.subscribe('global:user:messages', (messagePayload) => {
            const { targetUserId, message } = JSON.parse(messagePayload)
            console.log(
                `[WebSocketManager:${this.serverId}] Обробка особистого повідомлення з PubSub для ${targetUserId}: ${message}`,
            )

            // Перевіряємо, чи цей користувач підключений до ЦЬОГО сервера.
            const localConnectionIds = this.userIdToLocalConnectionIds.get(targetUserId)
            if (localConnectionIds) {
                for (const connId of localConnectionIds) {
                    const ws = this.connectionIdToWebSocketObject.get(connId)
                    if (ws) {
                        ws.send(`[Особисте] ${message}`)
                        console.log(
                            `[WebSocketManager:${this.serverId}] Надіслано особисте повідомлення локально ${connId} (${targetUserId})`,
                        )
                    }
                }
            }
        })
        console.log(`[WebSocketManager:${this.serverId}] Ініціалізовано PubSub та Storage.`)
    }

    /**
     * Закриває всі з'єднання та звільняє ресурси.
     */
    async close() {
        await this.pubSub.close()
        await this.storage.close()
        // Очищаємо локальні мапи
        this.connectionIdToWebSocketObject.clear()
        this.connectionIdToUserId.clear()
        this.userIdToLocalConnectionIds.clear()
        console.log(`[WebSocketManager:${this.serverId}] Закритий.`)
    }
}

module.exports = WebSocketManager
