// src/Manager.js
import Client from './models/Client.js'
import Room from './models/Room.js'

export default class Manager {
    // Конструктор тепер приймає функцію-фабрику брокера
    constructor(BrokerClass) {
        // Передаємо в брокер метод, який він має викликати при отриманні повідомлення з Redis
        this.broker = new BrokerClass(this.handleBrokerMessage.bind(this))
        this.clients = new Map()
        this.rooms = new Map()
        this.nextClientId = 1
    }

    addClient(ws) {
        const id = this.nextClientId++
        const client = new Client(id, ws)
        this.clients.set(id, client)
        this.joinRoom(client, 'general')
        return client
    }

    joinRoom(client, roomId) {
        let roomExists = this.rooms.has(roomId)
        if (!roomExists) {
            this.rooms.set(roomId, new Room(roomId))
        }

        const room = this.rooms.get(roomId)
        const wasEmpty = room.clients.size === 0

        room.addClient(client)

        // *** ЛОГІКА ЕФЕКТИВНОСТІ ***
        // Якщо це був перший клієнт на цьому сервері в цій кімнаті,
        // ми підписуємося на відповідний канал Redis.
        if (wasEmpty) {
            this.broker.subscribe(`room:${roomId}`)
        }

        client.send({ type: 'status', message: `Ви приєднались до кімнати ${roomId}` })
    }

    leaveRoom(client, roomId) {
        const room = this.rooms.get(roomId)
        if (room) {
            room.removeClient(client)

            // *** ЛОГІКА ЕФЕКТИВНОСТІ ***
            // Якщо кімната стала порожньою на цьому сервері, відписуємося від каналу Redis.
            if (room.clients.size === 0) {
                this.broker.unsubscribe(`room:${roomId}`)
                this.rooms.delete(roomId) // Очищуємо кімнату повністю
            }
        }
    }

    // Обробка повідомлень, що прийшли ЗОВНІ (від брокера)
    handleBrokerMessage(channel, rawMessage) {
        // Канал має формат 'room:general'
        const roomId = channel.split(':')[1]
        const message = JSON.parse(rawMessage)

        // Доставляємо повідомлення ЛИШЕ локальним клієнтам у цій конкретній кімнаті
        this.broadcastLocally(roomId, message)
    }

    // Відправка повідомлення (ініційована КЛІЄНТОМ на цьому сервері)
    handleClientMessage(client, message) {
        // Миттєво публікуємо повідомлення в конкретний канал кімнати Redis
        const roomId = 'general' // Приклад кімнати
        const payload = JSON.stringify({
            userId: client.id,
            text: message.text,
            type: 'chat',
        })

        // Використовуємо брокера для розповсюдження повідомлення
        this.broker.publish(`room:${roomId}`, payload)
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
