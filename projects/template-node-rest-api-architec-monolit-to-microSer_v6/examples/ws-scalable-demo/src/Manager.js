// src/Manager.js
import Client from './models/Client.js'
import Room from './models/Room.js'

export default class Manager {
    constructor(broker) {
        this.broker = broker
        this.clients = new Map()
        this.rooms = new Map()
        this.nextClientId = 1

        // Підписуємося на глобальний канал (або канал кімнати) через брокера
        // ВАЖЛИВО: Використовуємо тут канал КІМНАТИ
        this.broker.subscribe('room:general', this.handleBrokerMessage.bind(this))
    }

    addClient(ws) {
        const id = this.nextClientId++
        const client = new Client(id, ws)
        this.clients.set(id, client)

        // Автоматично додаємо нового клієнта до загальної кімнати
        this.joinRoom(client, 'general')
        return client
    }

    joinRoom(client, roomId) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Room(roomId))
        }
        const room = this.rooms.get(roomId)
        room.addClient(client)

        client.send({ type: 'status', message: `Ви приєднались до кімнати ${roomId}` })
    }

    // Обробка повідомлень, що прийшли ЗОВНІ (від брокера)
    handleBrokerMessage(rawMessage) {
        const message = JSON.parse(rawMessage)
        console.log(
            `[Manager] Отримано через брокера для кімнати ${message.roomId}: ${message.text}`,
        )
        this.broadcastLocally(message.roomId, message)
    }

    // Відправка повідомлення (ініційована КЛІЄНТОМ на цьому сервері)
    handleClientMessage(client, message) {
        // Тут ми використовуємо брокера для розповсюдження повідомлення
        // на УСІ інстанси, включаючи поточний
        const payload = JSON.stringify({
            roomId: 'general', // Приклад для загальної кімнати
            userId: client.id,
            text: message.text,
            type: 'chat',
        })

        this.broker.publish('room:general', payload)
    }

    // Доставка повідомлення ЛИШЕ локальним клієнтам
    broadcastLocally(roomId, message) {
        const room = this.rooms.get(roomId)
        if (room) {
            room.clients.forEach((client) => {
                client.send(message)
            })
        }
    }
}
