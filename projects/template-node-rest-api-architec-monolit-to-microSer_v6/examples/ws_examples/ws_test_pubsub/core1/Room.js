// src/room/Room.js

import { RoomTask } from './RoomTask.js'
import { Client } from '../core/Client.js'
import { IStateStorage } from '../storage/IStateStorage.js' // Імпортуємо інтерфейс

/**
 * Кімната для групування клієнтських з'єднань та управління завданнями.
 * Тепер взаємодіє зі сховищем стану.
 */
class Room {
    /**
     * @param {object} options - Опції для створення кімнати.
     * @param {string} [options.id] - ID кімнати.
     * @param {string} [options.name] - Ім'я кімнати.
     * @param {import('../namespace/Namespace').Namespace} options.namespace - Екземпляр неймспейсу, якому належить кімната.
     * @param {IStateStorage} options.storage - Екземпляр сховища стану.
     * @param {boolean} [options.isPersistent=false] - Чи повинна кімната бути постійною (не видалятися, коли порожня).
     * @param {object} [options.logger=console] - Екземпляр логера.
     */
    constructor({
        id,
        name,
        namespace,
        storage, // <-- Додано сховище
        isPersistent = false,
        logger = console,
    } = {}) {
        if (!namespace || !(storage instanceof IStateStorage)) {
            throw new Error(
                'Кімнату потрібно ініціалізувати екземпляром Namespace та IStateStorage.',
            )
        }

        this.id = id
        this.name = name
        this.namespace = namespace
        this.storage = storage // <-- Зберігаємо посилання на сховище
        this.isPersistent = isPersistent
        this.logger = logger
        /** @type {Map<string, RoomTask>} */
        this.tasks = new Map() // RoomTasks залишаються локальними для інстансу Room

        this.logger.debug(`Кімнату "${this.name}" (ID: ${this.id}) ініціалізовано.`)
    }

    /**
     * Асинхронна ініціалізація кімнати. Має бути викликана після конструктора.
     * Відповідає за підписку на Pub/Sub та перевірку завдань.
     */
    async initialize() {
        await this.#subscribeToRoomMessages() // Підписатися на Pub/Sub для повідомлень кімнат
        await this.#checkAndToggleTasks() // Перевірити стан клієнтів та запустити/зупинити завдання
        this.logger.info(
            `Кімнату "${this.name}" (ID: ${this.id}) в неймспейсі "${this.namespace.path}" ініціалізовано та готову до використання.`,
        )
    }

    /**
     * @private
     * Підписується на канали Pub/Sub для обробки повідомлень кімнат, що надходять з інших інстансів.
     */
    #subscribeToRoomMessages() {
        const roomChannel = `room:${this.namespace.path}:${this.id}:message`

        // Підписуємося на повідомлення для цієї конкретної кімнати
        this.storage.subscribe(roomChannel, async (channel, payload) => {
            if (payload.senderInstanceId === process.env.SERVER_INSTANCE_ID) {
                // this.logger.debug(`[Room Pub/Sub] Ігноруємо власне повідомлення кімнати з каналу '${channel}'.`);
                return // Ігнорувати повідомлення, які були відправлені цим же інстансом
            }

            this.logger.debug(
                `[Room Pub/Sub] Отримано повідомлення кімнати '${this.name}' (ID: ${
                    this.id
                }) з каналу '${channel}': ${JSON.stringify(payload).substring(0, 100)}...`,
            )

            // Отримати список клієнтів, які перебувають у цій кімнаті (з сховища)
            // і які є живими клієнтами цього інстансу
            const clientInfosInRoom = await this.storage.getClientsInRoom(
                this.namespace.path,
                this.id,
            )

            for (const clientInfo of clientInfosInRoom) {
                // Якщо клієнт підключений до ЦЬОГО інстансу, надіслати йому повідомлення
                const liveClient = this.namespace.server.liveClients.get(clientInfo.id)
                if (liveClient && !payload.excludedClientIds.includes(liveClient.id)) {
                    // Виключити клієнтів, які вже отримали повідомлення
                    liveClient.send(payload.messagePayload)
                }
            }
        })
    }

    /**
     * @private
     * Перевіряє кількість клієнтів (через сховище) та керує станом завдань.
     * Завдання запускаються, коли кількість клієнтів > 0.
     * Завдання зупиняються, коли кількість клієнтів = 0.
     */
    async #checkAndToggleTasks() {
        const clientCount = await this.storage.countClientsInRoom(this.namespace.path, this.id)
        if (clientCount > 0) {
            this.tasks.forEach((task) => {
                if (task.autoStart && !task.isTaskActive()) {
                    task.start()
                }
            })
            this.logger.debug(
                `Кількість з'єднань (${clientCount}) > 0. Усі авто-завдання в кімнаті "${this.name}" мають бути запущені.`,
            )
        } else {
            this.tasks.forEach((task) => {
                if (task.isTaskActive()) {
                    task.stop()
                }
            })
            this.logger.debug(
                `Кількість з'єднань (${clientCount}) = 0. Усі завдання в кімнаті "${this.name}" мають бути зупинені.`,
            )
        }
    }

    /**
     * Клієнтське з'єднання приєднується до цієї кімнати.
     * Оновлює стан у сховищі.
     * @param {Client} client - Об'єкт клієнтського з'єднання.
     */
    async join(client) {
        if (!client || typeof client.id === 'undefined' || typeof client.userId === 'undefined') {
            this.logger.error(
                "Спроба приєднатися з недійсним об'єктом клієнта (відсутній id або userId).",
            )
            return
        }

        const initialClientCount = await this.storage.countClientsInRoom(
            this.namespace.path,
            this.id,
        )
        const clientWasAlreadyInRoom = await this.storage
            .getClientsInRoom(this.namespace.path, this.id)
            .then((clients) => clients.some((c) => c.id === client.id))

        if (!clientWasAlreadyInRoom) {
            const added = await this.storage.addClientToRoom(
                this.namespace.path,
                this.id,
                client.id,
            )
            if (added) {
                this.logger.info(
                    `Клієнтське з'єднання "${client.id}" для Користувача "${client.username}" (ID: ${client.userId}) приєдналося до кімнати "${this.name}" у неймспейсі "${this.namespace.path}".`,
                )

                // Також додати клієнта до живих клієнтів неймспейсу цього інстансу, якщо його там ще немає
                await this.namespace._addClient(client)

                const currentClientCount = await this.storage.countClientsInRoom(
                    this.namespace.path,
                    this.id,
                )
                if (initialClientCount === 0 && currentClientCount > 0) {
                    this.logger.debug(
                        `Кількість з'єднань досягла ${currentClientCount}. Перевірка завдань на активацію.`,
                    )
                    await this.#checkAndToggleTasks()
                }
            } else {
                this.logger.warn(
                    `Не вдалося додати клієнта ${client.id} до кімнати ${this.id}. Можливо, його не існує.`,
                )
            }
        } else {
            this.logger.warn(
                `Клієнтське з'єднання "${client.id}" для Користувача "${client.username}" (ID: ${client.userId}) вже перебуває в кімнаті "${this.name}".`,
            )
        }
    }

    /**
     * Клієнтське з'єднання залишає цю кімнату.
     * Оновлює стан у сховищі та потенційно видаляє кімнату.
     * @param {Client} client - Об'єкт клієнтського з'єднання.
     * @returns {Promise<boolean>}
     */
    async leave(client) {
        if (!client || typeof client.id === 'undefined') {
            this.logger.error("Спроба залишити з недійсним об'єктом клієнта (відсутній id).")
            return false
        }

        const initialClientCount = await this.storage.countClientsInRoom(
            this.namespace.path,
            this.id,
        )
        const removed = await this.storage.removeClientFromRoom(
            this.namespace.path,
            this.id,
            client.id,
        )

        if (removed) {
            this.logger.info(
                `Клієнтське з'єднання "${client.id}" для Користувача "${client.username}" (ID: ${client.userId}) залишило кімнату "${this.name}" у неймспейсі "${this.namespace.path}".`,
            )

            const currentClientCount = await this.storage.countClientsInRoom(
                this.namespace.path,
                this.id,
            )

            // Повідомити неймспейс про можливе видалення клієнта з його liveClientsInNamespace
            // якщо клієнт більше не перебуває в жодній кімнаті цього неймспейсу
            await this.namespace._removeClient(client)

            if (initialClientCount > 0 && currentClientCount === 0) {
                this.logger.debug(
                    `Кількість з'єднань зменшилася до ${currentClientCount}. Перевірка завдань на деактивацію.`,
                )
                await this.#checkAndToggleTasks()

                // --- ЛОГІКА ВИДАЛЕННЯ ПОРОЖНЬОЇ КІМНАТИ ---
                if (!this.isPersistent) {
                    this.logger.info(
                        `Кімната "${this.name}" (ID: ${this.id}) стала порожньою та є динамічною. Видаляємо її з неймспейсу "${this.namespace.path}".`,
                    )
                    await this.namespace.deleteRoom(this.id) // Викликати метод видалення в неймспейсі (який видалить зі сховища)
                } else {
                    this.logger.info(
                        `Кімната "${this.name}" (ID: ${this.id}) стала порожньою, але є постійною. Не видаляємо.`,
                    )
                }
                // --- КІНЕЦЬ ЛОГІКИ ВИДАЛЕННЯ ---
            }
            return true
        }
        this.logger.warn(
            `Клієнтське з'єднання "${client.id}" для Користувача "${client.username}" (ID: ${client.userId}) не було в кімнаті "${this.name}".`,
        )
        return false
    }

    /**
     * Повертає список інформації про клієнтів, які перебувають у цій кімнаті (з сховища).
     * @returns {Promise<Array<import('../core/definitions').ClientInfo>>} - Масив об'єктів ClientInfo.
     */
    async getClients() {
        return await this.storage.getClientsInRoom(this.namespace.path, this.id)
    }

    /**
     * Надсилає повідомлення всім з'єднанням у цій кімнаті.
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
            roomId: this.id,
            roomName: this.name,
            namespacePath: this.namespace.path,
            ...metadata,
        }

        let sentCount = 0
        // Отримуємо список всіх клієнтів в кімнаті з сховища
        const allClientsInRoom = await this.storage.getClientsInRoom(this.namespace.path, this.id)

        for (const clientInfo of allClientsInRoom) {
            // Якщо клієнт підключений до ЦЬОГО інстансу і не виключений, надіслати йому безпосередньо
            const liveClient = this.namespace.server.liveClients.get(clientInfo.id)
            if (liveClient && !excludedClientIds.has(liveClient.id)) {
                liveClient.send(messagePayload)
                sentCount++
            }
        }

        // Публікуємо повідомлення для інших інстансів через Pub/Sub
        await this.storage.publish(`room:${this.namespace.path}:${this.id}:message`, {
            messagePayload,
            senderInstanceId: process.env.SERVER_INSTANCE_ID,
            excludedClientIds: Array.from(excludedClientIds),
        })

        this.logger.info(
            `Повідомлення надіслано в кімнаті "${this.name}" до ${sentCount} локальних клієнтських з'єднань та опубліковано для інших інстансів.`,
        )
        return sentCount
    }

    /**
     * Додає завдання до кімнати. Якщо кімната має клієнтів, завдання запускається негайно.
     * @param {string} id - Унікальний ID для завдання.
     * @param {Function} callback - Функція для виконання. Отримує об'єкт `roomInfo`.
     * @param {number} intervalMs - Інтервал у мілісекундах.
     * @param {boolean} [autoStart=true] - Чи запускати/зупиняти автоматично на основі кількості клієнтів.
     * @returns {Promise<RoomTask|null>} Створене завдання або null, якщо ID вже існує.
     */
    async addTask(id, callback, intervalMs, autoStart = true) {
        if (this.tasks.has(id)) {
            this.logger.warn(`Завдання з ID "${id}" вже існує в кімнаті "${this.name}".`)
            return null
        }
        const task = new RoomTask(
            id,
            callback,
            intervalMs,
            await this.getRoomInfo(),
            autoStart,
            this.logger,
        )
        this.tasks.set(id, task)
        if (
            autoStart &&
            (await this.storage.countClientsInRoom(this.namespace.path, this.id)) > 0
        ) {
            task.start()
        }
        this.logger.info(`Завдання "${id}" додано до кімнати "${this.name}".`)
        return task
    }

    /**
     * Видаляє завдання за його ID. Зупиняє завдання перед видаленням.
     * @param {string} id - ID завдання для видалення.
     * @returns {Promise<boolean>} True, якщо завдання було видалено, false в іншому випадку.
     */
    async removeTask(id) {
        const task = this.tasks.get(id)
        if (task) {
            task.destroy()
            this.tasks.delete(id)
            this.logger.info(`Завдання "${id}" видалено з кімнати "${this.name}".`)
            return Promise.resolve(true)
        }
        this.logger.warn(`Завдання з ID "${id}" не знайдено в кімнаті "${this.name}".`)
        return Promise.resolve(false)
    }

    /**
     * Запускає конкретне завдання за його ID.
     * @param {string} id - ID завдання для запуску.
     * @returns {Promise<boolean>} True, якщо завдання було запущено або вже запущено, false в іншому випадку.
     */
    async startTask(id) {
        const task = this.tasks.get(id)
        if (task) {
            if (
                task.autoStart &&
                (await this.storage.countClientsInRoom(this.namespace.path, this.id)) === 0
            ) {
                this.logger.warn(
                    `Завдання "${id}" у кімнаті "${this.name}" налаштовано на автозапуск і не має клієнтів. Неможливо запустити вручну.`,
                )
                return false
            }
            task.start()
            this.logger.info(`Завдання "${id}" запущено в кімнаті "${this.name}".`)
            return true
        }
        this.logger.warn(`Завдання з ID "${id}" не знайдено в кімнаті "${this.name}".`)
        return false
    }

    /**
     * Зупиняє конкретне завдання за його ID.
     * @param {string} id - ID завдання для зупинки.
     * @returns {Promise<boolean>} True, якщо завдання було зупинено або вже зупинено, false в іншому випадку.
     */
    async stopTask(id) {
        const task = this.tasks.get(id)
        if (task) {
            task.stop()
            this.logger.info(`Завдання "${id}" зупинено в кімнаті "${this.name}".`)
            return Promise.resolve(true)
        }
        this.logger.warn(`Завдання з ID "${id}" не знайдено в кімнаті "${this.name}".`)
        return Promise.resolve(false)
    }

    /**
     * Перевіряє, чи активне (виконується) завдання.
     * @param {string} id - ID завдання.
     * @returns {boolean} True, якщо завдання активне, false в іншому випадку.
     */
    isTaskActive(id) {
        const task = this.tasks.get(id)
        return task ? task.isTaskActive() : false
    }

    /**
     * Повертає інформаційний об'єкт для використання завданнями.
     * @returns {Promise<object>}
     */
    async getRoomInfo() {
        const clientsInRoom = await this.getClients() // Отримуємо клієнтів з сховища
        return {
            id: this.id,
            name: this.name,
            namespacePath: this.namespace.path,
            clients: clientsInRoom, // Надати копію масиву об'єктів ClientInfo
            sendMessage: this.sendMessage.bind(this), // Дозволити завданням надсилати повідомлення
        }
    }

    /**
     * Знищує кімнату, зупиняючи всі завдання.
     * Примітка: Це не видаляє кімнату зі сховища, цим займається Namespace.deleteRoom().
     */
    async destroy() {
        this.logger.info(
            `Знищення об'єкта кімнати "${this.name}" (ID: ${this.id}) та всіх її завдань у цьому інстансі.`,
        )
        this.tasks.forEach((task) => task.destroy())
        this.tasks.clear()

        // Відписатися від Pub/Sub каналів кімнати
        await this.storage.unsubscribe(
            `room:${this.namespace.path}:${this.id}:message`,
            (channel, payload) => {},
        )

        this.namespace = null
        this.storage = null
        this.logger = null
    }
}

export { Room }
