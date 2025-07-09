// src/room/Room.js
import { RoomTask } from './RoomTask.js'

class Room {
    /**
     * @private
     * Проста реалізація логера за замовчуванням, якщо інший не надано.
     * Імітує поведінку console для рівнів логування.
     * Тепер включає часову відмітку.
     */
    static #defaultLogger = {
        _formatMessage(level, msg) {
            const timestamp = new Date().toISOString()
            return `[${timestamp}] [${level.toUpperCase()}]: ${msg}`
        },
        error: (msg) => console.error(Room.#defaultLogger._formatMessage('error', msg)),
        warn: (msg) => console.warn(Room.#defaultLogger._formatMessage('warn', msg)),
        info: (msg) => console.info(Room.#defaultLogger._formatMessage('info', msg)),
        debug: (msg) => console.debug(Room.#defaultLogger._formatMessage('debug', msg)),
    }

    /**
     * @private
     * Проста реалізація "простору імен" за замовчуванням, якщо інший не надано.
     * Містить тільки властивість 'name'.
     */
    static #defaultNamespace = {
        name: 'DefaultRoomNamespace',
    }

    /**
     * Конструктор кімнати.
     * @param {object} [params={}] - Об'єкт параметрів.
     * @param {string} [params.id] - Унікальний ідентифікатор кімнати (генерується UUID за замовчуванням).
     * @param {string} [params.name] - Назва кімнати (генерується за замовчуванням).
     * @param {import('../namespace/Namespace').Namespace} options.namespace - Екземпляр неймспейсу, до якого належить кімната.
     * @param {boolean} [params.isPersistent=false] - Чи повинна кімната бути постійною (не видалятися, коли порожня)
     * @param {object} [params.logger=console] - Об'єкт логера з методами info, warn, error, debug.
     */
    constructor({ id, name, namespace, logger = console, isPersistent = false } = {}) {
        if (!namespace) {
            throw new Error('Room must be initialized with a Namespace instance.')
        }

        this.id =
            id ||
            (typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `room_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`)
        this.name = name || `Room_${this.id.toString().substring(0, 8)}`

        this.namespace = namespace
        this.clients = new Set() // Підключення клієнтів (Client об'єкти), що належать ЦІЙ кімнаті
        this.isPersistent = isPersistent
        this.logger = logger
        // Зберігаємо періодичні завдання (ID => RoomTask)
        this.tasks = new Map()

        this.logger.info(`Room "${this.name}" created in Namespace "${this.namespace.path}".`)
    }

    /**
     * @private
     * Перевіряє кількість клієнтів і керує станом завдань.
     * Завдання запускаються, коли клієнтів > 0.
     * Завдання зупиняються, коли клієнтів = 0.
     */
    #checkAndToggleTasks() {
        if (this.clients.size > 0) {
            this.tasks.forEach((task) => {
                if (!task.isTaskActive()) {
                    // Використовуємо метод isTaskActive
                    task.start()
                }
            })
            this.logger.debug(
                `Connections count (${this.clients.size}) > 0. All tasks in room "${this.name}" should be running.`,
            )
        } else {
            this.tasks.forEach((task) => {
                if (task.isTaskActive()) {
                    task.stop()
                }
            })
            this.logger.debug(
                `Connections count (${this.clients.size}) = 0. All tasks in room "${this.name}" should be stopped.`,
            )
        }
    }

    /**
     * Додає клієнта до кімнати.
     * @param {object} client - Об'єкт клієнта (повинен мати id та name).
     */
    join(client) {
        if (!client || typeof client.id === 'undefined' || typeof client.name === 'undefined') {
            this.logger.error(
                'Attempted to join with an invalid client object (missing id or name).',
            )
            return
        }
        if (!client.send || typeof client.send !== 'function') {
            this.logger.error(
                `Client ${client.name} (ID: ${client.id}) does not have a 'send' method. It must be an instance of Client.`,
            )
            return
        }

        const initialClientCount = this.clients.size

        if (!this.clients.has(client)) {
            this.clients.add(client)
            this.logger.info(
                `Client connection "${client.id}" for User "${client.username}" (ID: ${client.userId}) joined room "${this.name}" in namespace "${this.namespace.path}". Current connections in room: ${this.clients.size}`,
            )

            // Повідомляємо неймспейс, що цей клієнт приєднався до однієї з його кімнат
            // _addClient додасть його до clients Map неймспейсу, якщо ще немає
            this.namespace._addClient(client)

            // Завдання перевіряються, якщо кімната стає не порожньою (з 0 на 1+)
            if (initialClientCount === 0 && this.clients.size > 0) {
                this.logger.debug(
                    `Connection count reached ${this.clients.size}. Checking tasks for activation.`,
                )
                this.#checkAndToggleTasks()
            }
        } else {
            this.logger.warn(
                `Client connection "${client.id}" for User "${client.username}" (ID: ${client.userId}) is already in room "${this.name}".`,
            )
        }
    }

    /**
     * Видаляє клієнта з кімнати.
     * @param {object} client - Об'єкт клієнта (повинен мати id).
     * @returns {boolean} - True, якщо клієнта було видалено, false інакше.
     */
    leave(client) {
        if (!client || typeof client.id === 'undefined') {
            this.logger.error('Attempted to leave with an invalid client object (missing id).')
            return false
        }

        const initialClientCount = this.clients.size

        if (this.clients.delete(client)) {
            this.logger.info(
                `Client connection "${client.id}" for User "${client.username}" (ID: ${client.userId}) left room "${this.name}" in namespace "${this.namespace.path}". Current connections in room: ${this.clients.size}`,
            )

            // Повідомляємо неймспейс, що клієнт вийшов з цієї кімнати.
            // _removeClient перевірить, чи клієнт все ще перебуває в інших кімнатах цього неймспейсу.
            this.namespace._removeClient(client)

            // Завдання перевіряються, якщо кімната стає порожньою (з 1+ на 0)
            if (initialClientCount > 0 && this.clients.size === 0) {
                this.logger.debug(
                    `Connection count dropped to ${this.clients.size}. Checking tasks for deactivation.`,
                )
                this.#checkAndToggleTasks()

                // Видаляємо кімнату, якщо вона стала порожньою І НЕ є постійною.
                if (!this.isPersistent) {
                    this.logger.info(
                        `Room "${this.name}" (ID: ${this.id}) has become empty and is dynamic. We are removing it from the namespace "${this.namespace.path}".`,
                    )
                    this.namespace.deleteRoom(this.id) // Викликати метод видалення в неймспейсі
                } else {
                    this.logger.info(
                        `Room "${this.name}" (ID: ${this.id}) has become empty, but is permanent. We are not deleting it.`,
                    )
                }
            }
            return true
        }
        this.logger.warn(
            `Client connection "${client.id}" for User "${client.username}" (ID: ${client.userId}) was not in room "${this.name}".`,
        )
        return false
    }

    /**
     * Отримує всіх клієнтів у кімнаті.
     * @returns {Array<object>} - Масив об'єктів клієнтів.
     */
    getClients() {
        return Array.from(this.clients)
    }

    /**
     * Надсилає повідомлення всім учасникам кімнати окрім певної вибірки.
     * @param {string} message - Текст повідомлення.
     * @param {object} [options={}] - Налаштування повідомлення.
     * @param {Array<object>} [options.excludeClients=[]] - Масив клієнтів для виключення.
     * @param {string} [options.type='info'] - Тип повідомлення.
     * @param {object} [options.metadata={}] - Додаткові метадані.
     * @returns {number} - Кількість клієнтів, яким було надіслано повідомлення.
     */
    sendMessage(message, options = {}) {
        const { excludeClients = [], type = 'info', metadata = {} } = options
        const excludedClientIds = new Set(excludeClients.map((c) => c.id))

        const messagePayload = {
            message,
            type,
            timestamp: new Date().toISOString(),
            roomId: this.id,
            roomName: this.name,
            ...metadata,
        }

        let sentCount = 0
        this.clients.forEach((client) => {
            if (!excludedClientIds.has(client.id)) {
                this.logger.debug(
                    `[${this.name} to ${client.name} (${
                        client.id
                    }) | Type: ${type}]: ${JSON.stringify(messagePayload)}`,
                )
                // Тут має бути реальна логіка відправки повідомлення клієнту
                client.send(messagePayload, options)
                sentCount++
            }
        })
        this.logger.info(
            `Message sent in room "${this.name}" to ${sentCount} client connections (excluded ${excludedClientIds.size} connections).`,
        )

        return sentCount
    }

    /**
     * Додає періодичне завдання до кімнати.
     * Завдання буде виконуватися, коли кількість клієнтів > 0.
     * @param {string} taskId - Унікальний ідентифікатор завдання.
     * @param {function(object): (Promise<any>|any)} callback - Асинхронна функція, яка буде викликана періодично.
     * Приймає об'єкт з інформацією про кімнату.
     * @param {number} interval - Інтервал у мілісекундах (наприклад, 5000 для 5 секунд).
     * @param {boolean} [runImmediately=false] - Чи викликати callback одразу, як тільки задача стане активною, а потім за інтервалом.
     * @returns {boolean} - True, якщо завдання було додано успішно, false інакше (якщо ID вже існує).
     */
    addTask(taskId, callback, interval, runImmediately = false) {
        if (this.tasks.has(taskId)) {
            this.logger.warn(`Task "${taskId}" already exists in room "${this.name}".`)
            return false
        }
        if (typeof callback !== 'function' || interval <= 0) {
            this.logger.error(
                `Invalid task parameters for "${taskId}". Callback must be a function, interval must be > 0.`,
            )
            return false
        }

        // Передаємо 'this' (поточний екземпляр Room) як roomContext
        const task = new RoomTask(taskId, callback, interval, runImmediately, this.logger, this)
        this.tasks.set(taskId, task)
        this.logger.info(`Task "${taskId}" added to room "${this.name}".`)

        this.#checkAndToggleTasks()
        return true
    }

    removeTask(taskId) {
        const task = this.tasks.get(taskId)
        if (task) {
            task.destroy()
            this.tasks.delete(taskId)
            this.logger.info(`Task "${taskId}" removed from room "${this.name}".`)
            return true
        }
        this.logger.warn(`Task "${taskId}" not found in room "${this.name}".`)
        return false
    }

    getTask(taskId) {
        return this.tasks.get(taskId)
    }

    /**
     * Вмикає (запускає) конкретне періодичне завдання за його ID.
     * Завдання запуститься, якщо кімната має клієнтів (згідно логіки #checkAndToggleTasks).
     * @param {string} taskId - ID завдання для запуску.
     * @returns {boolean} - True, якщо завдання знайдено та спробувало запуститись; false, якщо завдання не знайдено.
     */
    startTask(taskId) {
        const task = this.tasks.get(taskId)
        if (task) {
            // Дозволяємо запустити лише якщо кімната активна (має клієнтів)
            if (this.clients.size > 0) {
                task.start()
                this.logger.info(
                    `Manually attempted to start task "${taskId}" in room "${this.name}".`,
                )
                return true
            } else {
                this.logger.warn(
                    `Cannot start task "${taskId}" in room "${this.name}": room has no clients.`,
                )
                return false
            }
        }
        this.logger.warn(`Task "${taskId}" not found in room "${this.name}". Cannot start.`)
        return false
    }

    /**
     * Вимикає (зупиняє) конкретне періодичне завдання за його ID.
     * @param {string} taskId - ID завдання для зупинки.
     * @returns {boolean} - True, якщо завдання знайдено та зупинено; false, якщо завдання не знайдено.
     */
    stopTask(taskId) {
        const task = this.tasks.get(taskId)
        if (task) {
            task.stop()
            this.logger.info(`Manually stopped task "${taskId}" in room "${this.name}".`)
            return true
        }
        this.logger.warn(`Task "${taskId}" not found in room "${this.name}". Cannot stop.`)
        return false
    }

    /**
     * Отримує статус активності конкретного завдання.
     * @param {string} taskId - ID завдання.
     * @returns {boolean|undefined} - True, якщо завдання активне; False, якщо не активне; Undefined, якщо завдання не знайдено.
     */
    isTaskActive(taskId) {
        const task = this.tasks.get(taskId)
        if (task) {
            return task.isTaskActive()
        }
        return undefined // Або false, залежить від бажаного інтерфейсу
    }

    destroy() {
        this.logger.info(`Destroying room "${this.name}" and all its tasks.`)
        this.tasks.forEach((task) => task.destroy())
        this.tasks.clear()

        // Повідомляємо неймспейс про вихід усіх клієнтів з цієї кімнати
        this.clients.forEach((client) => {
            this.namespace._removeClient(client) // Namespace вирішить, чи видаляти клієнта повністю
        })
        this.clients.clear()

        this.namespace = null
        this.logger = null
    }
}

export { Room }
