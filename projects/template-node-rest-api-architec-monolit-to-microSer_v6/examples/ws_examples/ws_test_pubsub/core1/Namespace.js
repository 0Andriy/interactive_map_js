// src/namespace/Namespace.js

import { Room } from '../room/Room.js'
import { Client } from '../core/Client.js'
import { IStateStorage } from '../storage/IStateStorage.js' // Імпортуємо інтерфейс

/**
 * Представляє окремий неймспейс, який керує своїми кімнатами
 * та всіма з'єднаннями (об'єктами Client), підключеними до цього неймспейсу.
 * Тепер взаємодіє зі сховищем стану.
 */
class Namespace {
    /**
     * @param {string} path - Шлях неймспейсу.
     * @param {import('../core/Server').Server} server - Екземпляр сервера (для доступу до загальних сервісів).
     * @param {IStateStorage} storage - Екземпляр сховища стану.
     * @param {object} [logger=console] - Екземпляр логера. За замовчуванням використовується console.
     */
    constructor(path, server, storage, logger = console) {
        if (!path || !server || !(storage instanceof IStateStorage)) {
            throw new Error(
                'Неймспейс повинен мати шлях, екземпляр сервера та екземпляр IStateStorage.',
            )
        }
        this.path = path
        this.server = server
        this.storage = storage // <-- Зберігаємо посилання на сховище
        this.logger = logger

        // Ці Map тепер керують лише живими об'єктами Room та Client,
        // які завантажено в пам'ять цього інстансу.
        // Інформація про кімнати та клієнтів зберігається в storage.
        /** @type {Map<string, Room>} */
        this.liveRooms = new Map() // Map<roomId, Room instance>
        /** @type {Map<string, Client>} */
        this.liveClientsInNamespace = new Map() // Map<clientId, Client instance> - клієнти, які ПІДКЛЮЧЕНІ до цього неймспейсу

        this.logger.debug(`Неймспейс "${this.path}" ініціалізовано.`)
    }

    /**
     * Асинхронна ініціалізація неймспейсу. Має бути викликана після конструктора.
     */
    async initialize() {
        await this.#subscribeToNamespaceMessages() // Підписатися на Pub/Sub для повідомлень неймспейсу
        this.logger.info(`Неймспейс "${this.path}" ініціалізовано та готово до використання.`)
    }

    /**
     * @private
     * Підписується на канали Pub/Sub для обробки повідомлень кімнат, що надходять з інших інстансів.
     */
    #subscribeToNamespaceMessages() {
        const namespaceChannel = `namespace:${this.path}:message`

        this.storage.subscribe(namespaceChannel, async (channel, payload) => {
            if (payload.senderInstanceId === process.env.SERVER_INSTANCE_ID) {
                // this.logger.debug(`[Namespace Pub/Sub] Ігноруємо власне повідомлення неймспейсу з каналу '${channel}'.`);
                return // Ігнорувати повідомлення, які були відправлені цим же інстансом
            }

            this.logger.debug(
                `[Namespace Pub/Sub] Отримано повідомлення для неймспейсу '${
                    this.path
                }' з каналу '${channel}': ${JSON.stringify(payload).substring(0, 100)}...`,
            )

            // Надсилаємо повідомлення локально підключеним клієнтам у цьому неймспейсі
            this.liveClientsInNamespace.forEach((client) => {
                if (!payload.excludedClientIds.includes(client.id)) {
                    // Виключити клієнтів, які вже отримали повідомлення
                    client.send(payload.messagePayload)
                }
            })
        })
    }

    /**
     * @private
     * Додає клієнтське з'єднання до списку клієнтів цього неймспейсу
     * (для внутрішнього обліку живих об'єктів у цьому інстансі).
     * @param {Client} client - Об'єкт клієнтського з'єднання.
     */
    async _addClient(client) {
        if (!client || !(client instanceof Client)) {
            this.logger.error(`Спроба додати об'єкт, що не є Client, до Неймспейсу "${this.path}".`)
            return
        }

        // Додати до живих клієнтів цього неймспейсу (для швидкого доступу в цьому інстансі)
        if (!this.liveClientsInNamespace.has(client.id)) {
            this.liveClientsInNamespace.set(client.id, client)
            this.logger.debug(
                `Клієнтське з'єднання "${client.id}" для Користувача "${client.username}" (ID: ${client.userId}) додано до живих клієнтів Неймспейсу "${this.path}".`,
            )
        }
    }

    /**
     * @private
     * Видаляє клієнтське з'єднання зі списку клієнтів цього неймспейсу.
     * Це викликається, коли клієнт відключається від сервера, або коли він покидає всі кімнати в цьому неймспейсі.
     * @param {Client} client - Об'єкт клієнтського з'єднання.
     */
    async _removeClient(client) {
        if (!client || !(client instanceof Client)) {
            this.logger.error(
                `Спроба видалити об'єкт, що не є Client, з Неймспейсу "${this.path}".`,
            )
            return
        }

        // Перевірити, чи з'єднання все ще перебуває в будь-якій кімнаті цього неймспейсу
        let isClientStillInAnyRoom = false
        const roomsInNamespace = await this.storage.getRoomsByNamespace(this.path)
        for (const roomInfo of roomsInNamespace) {
            const clientsInRoom = await this.storage.getClientsInRoom(this.path, roomInfo.id)
            if (clientsInRoom.some((c) => c.id === client.id)) {
                isClientStillInAnyRoom = true
                break
            }
        }

        // Видалити з'єднання з liveClientsInNamespace, якщо воно більше не перебуває в жодній з його кімнат
        // Це важливо для коректного обліку "живих" клієнтів для цього інстансу.
        if (!isClientStillInAnyRoom) {
            if (this.liveClientsInNamespace.delete(client.id)) {
                this.logger.debug(
                    `Клієнтське з'єднання "${client.id}" для Користувача "${client.username}" (ID: ${client.userId}) видалено з живих клієнтів Неймспейсу "${this.path}".`,
                )
            }
        } else {
            this.logger.debug(
                `Клієнтське з'єднання "${client.id}" для Користувача "${client.userId}") все ще перебуває в інших кімнатах Неймспейсу "${this.path}". Поки не видаляємо з liveClientsInNamespace.`,
            )
        }
    }

    /**
     * Повертає список усіх кімнат у цьому неймспейсі (з сховища).
     * Якщо кімната ще не "жива" (об'єкт Room не завантажено в пам'ять цього інстансу),
     * вона буде створена та додана до liveRooms.
     * @returns {Promise<Array<Room>>}
     */
    async getAllRooms() {
        const roomInfos = await this.storage.getRoomsByNamespace(this.path)
        // Повернути живі об'єкти Room, якщо вони вже завантажені
        return Promise.all(
            roomInfos.map(async (rInfo) => {
                if (this.liveRooms.has(rInfo.id)) {
                    return this.liveRooms.get(rInfo.id)
                } else {
                    // Якщо кімнату ще не завантажено в пам'ять цього інстансу, завантажити її
                    const room = new Room({
                        id: rInfo.id,
                        name: rInfo.name,
                        namespace: this,
                        isPersistent: rInfo.isPersistent,
                        logger: this.logger,
                        storage: this.storage, // Передаємо сховище в Room
                    })
                    this.liveRooms.set(rInfo.id, room)
                    await room.initialize() // Важливо: ініціалізувати кімнату, щоб вона підписалася на Pub/Sub
                    return room
                }
            }),
        )
    }

    /**
     * Повертає список усіх клієнтських з'єднань (об'єктів Client), підключених до цього неймспейсу
     * на ЦЬОМУ інстансі.
     * @returns {Array<Client>}
     */
    getAllClients() {
        return Array.from(this.liveClientsInNamespace.values())
    }

    /**
     * Отримує кімнату з ЦЬОГО неймспейсу за її ID (спочатку з liveRooms, потім зі сховища).
     * @param {string} id - ID кімнати.
     * @returns {Promise<Room|undefined>} - Об'єкт кімнати або undefined, якщо не знайдено.
     */
    async getRoom(id) {
        if (this.liveRooms.has(id)) {
            return this.liveRooms.get(id)
        }

        const roomInfo = await this.storage.getRoom(this.path, id)
        if (roomInfo) {
            const room = new Room({
                id: roomInfo.id,
                name: roomInfo.name,
                namespace: this,
                isPersistent: roomInfo.isPersistent,
                logger: this.logger,
                storage: this.storage,
            })
            this.liveRooms.set(id, room) // Додати до liveRooms цього інстансу
            await room.initialize() // Важливо: ініціалізувати кімнату
            return room
        }
        return undefined
    }

    /**
     * Створює нову кімнату в ЦЬОМУ неймспейсі та в сховищі.
     * @param {string} [id] - ID кімнати (генерується, якщо не надано).
     * @param {string} [name] - Ім'я кімнати (генерується, якщо не надано).
     * @param {boolean} [isPersistent=false] - Чи повинна кімната бути постійною.
     * @returns {Promise<Room>} - Створена або існуюча кімната.
     */
    async createRoom(id, name, isPersistent = false) {
        let roomId =
            id ||
            (typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `room_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`)

        // Перевірити, чи кімната вже існує в сховищі
        let roomInfo = await this.storage.getRoom(this.path, roomId)
        if (roomInfo) {
            this.logger.warn(
                `Кімната з ID "${roomId}" вже існує в Неймспейсі "${this.path}" у сховищі.`,
            )
            // Якщо існує в сховищі, але не завантажена в liveRooms цього інстансу, завантажити її
            if (!this.liveRooms.has(roomId)) {
                const existingRoom = new Room({
                    id: roomInfo.id,
                    name: roomInfo.name,
                    namespace: this,
                    isPersistent: roomInfo.isPersistent,
                    logger: this.logger,
                    storage: this.storage,
                })
                this.liveRooms.set(roomId, existingRoom)
                await existingRoom.initialize() // Важливо: ініціалізувати кімнату
                return existingRoom
            }
            return this.liveRooms.get(roomId)
        }

        const newRoomInfo = {
            id: roomId,
            name: name || `Кімната_${roomId.toString().substring(0, 8)}`,
            namespacePath: this.path, // Зберігаємо шлях до неймспейсу
            isPersistent: isPersistent,
        }

        await this.storage.addRoom(this.path, newRoomInfo) // Зберегти в сховищі
        const newRoom = new Room({
            id: newRoomInfo.id,
            name: newRoomInfo.name,
            namespace: this,
            isPersistent: newRoomInfo.isPersistent,
            logger: this.logger,
            storage: this.storage,
        })
        this.liveRooms.set(newRoom.id, newRoom) // Додати до liveRooms цього інстансу
        await newRoom.initialize() // Важливо: ініціалізувати кімнату
        this.logger.info(
            `Кімнату "${newRoom.name}" створено з ID "${newRoom.id}" у Неймспейсі "${this.path}". ${
                isPersistent ? '(Постійна)' : '(Динамічна)'
            }`,
        )
        return newRoom
    }

    /**
     * Видаляє кімнату з ЦЬОГО неймспейсу та зі сховища.
     * @param {string} id - ID кімнати.
     * @returns {Promise<boolean>} - True, якщо кімната була видалена, false в іншому випадку.
     */
    async deleteRoom(id) {
        const roomToDelete = this.liveRooms.get(id) // Отримати живий об'єкт Room

        if (roomToDelete) {
            // Зупинити та знищити об'єкт Room цього інстансу
            await roomToDelete.destroy()
            this.liveRooms.delete(id) // Видалити з liveRooms цього інстансу
            this.logger.debug(`Об'єкт Room "${id}" видалено з пам'яті інстансу "${this.path}".`)
        }

        // Видалити кімнату зі сховища
        const result = await this.storage.removeRoom(this.path, id)
        if (result) {
            this.logger.info(
                `Кімнату з ID "${id}" повністю видалено зі сховища для Неймспейсу "${this.path}".`,
            )
            return true
        }
        this.logger.warn(
            `Кімнату з ID "${id}" не знайдено в сховищі для Неймспейсу "${this.path}".`,
        )
        return false
    }

    /**
     * Надсилає повідомлення всім з'єднанням, підключеним до цього неймспейсу.
     * @param {string} message - Текст повідомлення.
     * @param {object} [options={}] - Опції повідомлення (можуть включати тип, метадані, excludeClients).
     * @param {Array<Client>} [options.excludeClients=[]] - Масив об'єктів Client, яких слід виключити з розсилки.
     * @returns {Promise<number>} - Кількість з'єднань, яким було надіслано повідомлення (лише локально).
     */
    async sendMessage(message, options = {}) {
        const { excludeClients = [], type = 'info', metadata = {} } = options
        const excludedClientIds = new Set(excludeClients.map((c) => c.id))

        const messagePayload = {
            message,
            type,
            timestamp: new Date().toISOString(),
            namespacePath: this.path,
            ...metadata,
        }

        let sentCount = 0
        // Надсилаємо повідомлення локально підключеним клієнтам у цьому неймспейсі
        this.liveClientsInNamespace.forEach((client) => {
            if (!excludedClientIds.has(client.id)) {
                client.send(messagePayload)
                sentCount++
            }
        })

        // Публікуємо повідомлення для інших інстансів через Pub/Sub
        await this.storage.publish(`namespace:${this.path}:message`, {
            messagePayload,
            senderInstanceId: process.env.SERVER_INSTANCE_ID,
            excludedClientIds: Array.from(excludedClientIds), // Передаємо виключених клієнтів
        })

        this.logger.info(
            `Повідомлення надіслано в Неймспейсі "${this.path}" до ${sentCount} локальних клієнтських з'єднань та опубліковано для інших інстансів.`,
        )
        return sentCount
    }

    /**
     * Знищує неймспейс цього інстансу, зупиняючи всі кімнати та очищаючи живих клієнтів.
     * Примітка: Це не видаляє неймспейс зі сховища, лише з пам'яті цього інстансу.
     */
    async destroy() {
        this.logger.info(
            `Знищення об'єкта Неймспейсу "${this.path}" та всіх його кімнат у цьому інстансі.`,
        )

        // Відписатися від Pub/Sub каналів неймспейсу
        await this.storage.unsubscribe(`namespace:${this.path}:message`, (channel, payload) => {})

        // Зупинити та знищити всі живі об'єкти Room в цьому неймспейсі
        for (const room of this.liveRooms.values()) {
            await room.destroy() // Room.destroy() тепер також використовує storage
        }
        this.liveRooms.clear()

        this.liveClientsInNamespace.clear() // Очистити список клієнтів неймспейсу цього інстансу
        this.storage = null
        this.logger = null
    }
}

export { Namespace }
