// src/models/Room.js
export class Room {
    constructor(roomId, broker, wsManager) {
        this.id = roomId
        this.broker = broker
        this.wsManager = wsManager // Потрібен для доступу до локальних клієнтів
    }

    // Метод, аналогічний io.to('roomName').emit(...)
    async emit(eventName, data) {
        const messagePayload = { event: eventName, data: data, roomId: this.id }

        // Публікуємо через брокер, щоб всі сервери отримали повідомлення
        await this.broker.publish('ws-broadcast', JSON.stringify(messagePayload))

        // У Socket.IO локальний сервер також обробляє своє власне повідомлення через Pub/Sub,
        // але ми можемо оптимізувати і відправити локально відразу.
        // Це спрощення, Socket.IO робить це через обробник підписки.
        // this.sendLocal(messagePayload);
    }

    // Приватний метод для локальної доставки (викликається обробником брокера)
    async sendLocal(messagePayload) {
        // Отримуємо всіх користувачів у кімнаті з брокера (розподілений список)
        const userIdsInRoom = await this.broker.sMembers(`room:${this.id}:members`)

        // Відправляємо повідомлення тільки локально підключеним клієнтам
        userIdsInRoom.forEach((userId) => {
            // wsManager допомагає знайти живий об'єкт WS
            const client = this.wsManager.getClient(userId)
            if (client) {
                client.send(messagePayload)
            }
        })
    }
}
