import { Room } from './Room.js'

/**
 * Клас Namespace: забезпечує логічну ізоляцію з'єднань, керування кімнатами
 * та синхронізацію подій між вузлами кластера з підтримкою DI.
 */
export class Namespace {
    /**
     * Створює екземпляр неймспейсу.
     * @param {Object} params - Параметри ініціалізації.
     * @param {string} params.name - Унікальне ім'я неймспейсу (напр. '/chat').
     * @param {string} params.serverId - Унікальний ID поточного вузла сервера.
     * @param {import('../interfaces/IStateAdapter').IStateAdapter} params.state - Адаптер стану (Redis/DB).
     * @param {import('../interfaces/IBrokerAdapter').IBrokerAdapter} params.broker - Адаптер брокера (Redis PubSub/NATS).
     * @param {import('../interfaces/ILogger').ILogger} params.logger - Інтерфейс для логування.
     * @param {any} [params.scheduler] - Планувальник завдань (якщо потрібно).
     */
    constructor({ name, serverId, state, broker, scheduler, logger }) {
        /** @type {string} */
        this.name = name

        /** @type {string} */
        this.serverId = serverId

        /** @type {import('../interfaces/IStateAdapter').IStateAdapter} */
        this.state = state

        /** @type {import('../interfaces/IBrokerAdapter').IBrokerAdapter} */
        this.broker = broker

        /** @type {import('../interfaces/ILogger').ILogger} */
        this.logger = logger

        /** @type {any} */
        this.scheduler = scheduler

        /**
         * Реєстр активних з'єднань на цьому сервері.
         * @type {Map<string, import('./Connection').Connection>}
         */
        this.connections = new Map()

        /**
         * Реєстр активних кімнат у цьому неймспейсі.
         * @type {Map<string, Room>}
         */
        this.roomsMap = new Map()

        /**
         * Глобальний топік неймспейсу для брокера.
         * @type {string}
         */
        this.nsTopic = `broker_namespace:${this.name}`

        /**
         * Функція відписки від глобального каналу.
         * @type {Function|null}
         * @private
         */
        this._unsubNS = null

        // Автоматичний запуск підписки
        this._subscribeToGlobal()
    }

    /**
     * Активує підписку на глобальний канал неймспейсу в брокері.
     * @private
     * @returns {Promise<void>}
     */
    async _subscribeToGlobal() {
        try {
            // Перевіряємо, чи ми вже підписані, щоб уникнути дублікатів
            if (this._unsubNS) return

            this._unsubNS = await this.broker.subscribe(this.nsTopic, (packet) => {
                // Ігноруємо повідомлення від самого себе
                if (packet.origin === this.serverId) return

                // Транслюємо отриманий пакет локальним клієнтам
                this._localNamespaceEmit(packet.envelope)
            })

            this.logger?.info(`[NS:${this.name}] Успішна підписка на глобальний топік брокера`)
        } catch (error) {
            this.logger?.error(`[NS:${this.name}] Помилка підписки на брокер: ${error.message}`)
        }
    }

    /**
     * Скасовує підписку на глобальний канал неймспейсу.
     * @private
     * @returns {Promise<void>}
     */
    async _unsubscribeFromGlobal() {
        if (this._unsubNS) {
            try {
                await this._unsubNS()
                this._unsubNS = null
                this.logger?.debug(`[NS:${this.name}] Скасовано підписку на глобальний топік`)
            } catch (error) {
                this.logger?.error(`[NS:${this.name}] Помилка під час відписки: ${error.message}`)
            }
        }
    }

    /**
     * Отримати об'єкт кімнати. Якщо кімнати не існує — створити її.
     * @param {string} roomName
     * @returns {Room}
     */
    room(roomName) {
        let room = this.roomsMap.get(roomName)
        if (!room) {
            room = new Room(roomName, this)
            this.roomsMap.set(roomName, room)
        }
        return room
    }

    /**
     * Надіслати повідомлення всім підключеним клієнтам у цьому неймспейсі (весь кластер).
     * @param {string} type - Тип події.
     * @param {Object} payload - Дані повідомлення.
     * @param {Object|null} [sender] - Дані відправника.
     * @returns {Promise<void>}
     */
    async broadcast(type, payload, sender = null) {
        const envelope = {
            id: crypto.randomUUID(),
            ns: this.name,
            type,
            ts: Date.now(),
            sender,
            payload,
        }

        // 1. Публікація в брокер для інших вузлів
        await this.broker.publish(this.nsTopic, {
            envelope,
            origin: this.serverId,
        })

        // 2. Локальна розсилка
        this._localNamespaceEmit(envelope)
    }

    /**
     * Розсилка повідомлення локальним підключенням.
     * @param {Object} envelope - Конверт повідомлення.
     * @private
     */
    _localNamespaceEmit(envelope) {
        this.connections.forEach((conn) => {
            conn.send(envelope)
        })
    }

    /**
     * Опорний метод для аутентифікації.
     * Має бути перевизначений у конкретній реалізації неймспейсу.
     * @param {import('http').IncomingMessage} req - Об'єкт запиту.
     * @returns {Promise<Object|null>} - Дані користувача або null.
     */
    async authenticate(req) {
        this.logger?.warn(`[NS:${this.name}] Метод authenticate не реалізовано.`)
        return null
    }

    /**
     * Обробка вхідних сирих даних від з'єднання.
     * @param {import('./Connection').Connection} connection - Об'єкт з'єднання.
     * @param {any} rawData - Сирі дані повідомлення.
     * @returns {Promise<void>}
     */
    async onMessage(connection, rawData) {
        // Базова реалізація лише логує повідомлення.
        // Перевизначається в підкласах для реалізації бізнес-логіки.
        this.logger?.debug(`[NS:${this.name}] Повідомлення від ${connection.id}: ${rawData}`)
    }

    /**
     * Повне знищення неймспейсу, закриття з'єднань та очищення ресурсів.
     * @returns {Promise<void>}
     */
    async destroy() {
        this.logger?.info(`[NS:${this.name}] Початок знищення неймспейсу...`)

        // 1. Відписка від брокера
        await this._unsubscribeFromGlobal()

        // 2. Знищення всіх кімнат (використовуємо allSettled для надійності)
        const rooms = Array.from(this.roomsMap.values())
        await Promise.allSettled(rooms.map((r) => r.destroy()))

        // 3. Коректне закриття всіх з'єднань
        for (const conn of this.connections.values()) {
            if (conn.ws.readyState !== conn.ws.OPEN) continue

            conn.ws.close(1001, 'NS_TERMINATED')
        }

        this.connections.clear()
        this.roomsMap.clear()

        this.logger?.info(`[NS:${this.name}] Неймспейс успішно знищено.`)
    }
}
