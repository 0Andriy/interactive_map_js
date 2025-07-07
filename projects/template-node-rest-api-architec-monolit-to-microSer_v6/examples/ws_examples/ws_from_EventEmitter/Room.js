// src/Room.js

import { EventEmitter } from 'events'
import { logger } from './utils/logger.js'

/**
 * @typedef {import('./Client.js').default} Client
 */

/**
 * @callback UpdateCallback
 * @param {string} roomName Назва кімнати.
 * @param {Set<Client>} activeClients Набір активних клієнтів у кімнаті.
 * @returns {Promise<any>} Дані для розсилки клієнтам.
 */

/**
 * @typedef {object} RoomOptions
 * @property {UpdateCallback} [updateCallback] Асинхрона функція для періодичного отримання даних.
 * @property {number} [updateIntervalMs=0] Інтервал оновлення в мілісекундах (мс).
 * @property {boolean} [runInitialUpdate=false] Чи запускати `updateCallback` одразу.
 */

/**
 * Клас, що інкапсулює логіку однієї WebSocket кімнати.
 */
class Room extends EventEmitter {
    /**
     * @type {string}
     */
    name

    /**
     * @private
     * @type {Set<string>}
     */
    #clientIds = new Set() // Зберігаємо тільки ID клієнтів для оптимізації

    /**
     * @private
     * @type {RoomOptions}
     */
    #options

    /**
     * @private
     * @type {import('./Namespace.js').default}
     */
    #namespace // Посилання на батьківський Namespace

    /**
     * @private
     * @type {import('./utils/logger.js').ILogger}
     */
    #logger

    /**
     * @private
     * @type {NodeJS.Timeout|null}
     */
    #intervalId = null

    /**
     * @param {string} name - Назва кімнати.
     * @param {RoomOptions} [options={}] - Опції для кімнати.
     * @param {import('./Namespace.js').default} namespace - Посилання на простір імен, що керує кімнатою.
     */
    constructor(name, options = {}, namespace) {
        super()
        this.name = name
        this.#namespace = namespace
        this.#logger = logger
        this.#options = {
            updateIntervalMs: 0,
            runInitialUpdate: false,
            ...options,
        }
        this.#logger.info(`Кімнату '${this.name}' створено в просторі '${this.#namespace.path}'.`)
    }

    /**
     * Додає клієнта до кімнати.
     * @param {Client} client - Об'єкт клієнта.
     */
    addClient(client) {
        if (this.#clientIds.has(client.id)) return

        this.#clientIds.add(client.id)
        client.join(this.name) // Клієнт знає, що він у цій кімнаті
        this.#logger.info(
            `[Room:${this.name}] Клієнт ${client.id} (User: ${
                client.user ? client.user.userId : 'Guest'
            }) приєднався.`,
        )

        // Запускаємо оновлення, якщо це перший клієнт і є налаштування інтервалу
        if (this.#clientIds.size === 1 && this.#options.updateIntervalMs > 0) {
            this.#startUpdates()
        }
    }

    /**
     * Видаляє клієнта з кімнати.
     * @param {Client} client - Об'єкт клієнта.
     */
    removeClient(client) {
        if (this.#clientIds.delete(client.id)) {
            client.leave(this.name) // Клієнт знає, що він покинув цю кімнату
            this.#logger.info(
                `[Room:${this.name}] Клієнт ${client.id} (User: ${
                    client.user ? client.user.userId : 'Guest'
                }) покинув кімнату.`,
            )

            // Якщо кімната стала порожньою, знищуємо її
            if (this.#clientIds.size === 0) {
                this.#logger.info(`Кімната '${this.name}' стала порожньою. Запуск знищення.`)
                this.destroy()
            }
        }
    }

    /**
     * Повертає кількість клієнтів у кімнаті.
     * @returns {number}
     */
    getClientCount() {
        return this.#clientIds.size
    }

    /**
     * Надсилає повідомлення всім клієнтам у цій кімнаті.
     * @param {string} eventName - Назва події.
     * @param {object} payload - Об'єкт даних.
     * @param {Client} [sender=null] - Опціонально, клієнт, що надсилає (для розсилки всім, крім нього).
     * @returns {number} Кількість одержувачів.
     */
    broadcast(eventName, payload, sender = null) {
        let sentCount = 0
        this.#clientIds.forEach((clientId) => {
            const client = this.#namespace.getClientById(clientId) // Отримуємо об'єкт клієнта через namespace
            // Перевіряємо, чи клієнт існує, чи з'єднання відкрите, і чи він не є відправником
            if (client && client.ws.readyState === client.ws.OPEN && client !== sender) {
                client.send(eventName, payload)
                sentCount++
            }
        })
        return sentCount
    }

    /**
     * Знищує кімнату: зупиняє інтервали та видаляє себе з менеджера (Namespace).
     */
    destroy() {
        if (this.#intervalId) {
            clearInterval(this.#intervalId)
            this.#intervalId = null
            this.#logger.info(`Інтервал оновлень для кімнати '${this.name}' зупинено.`)
        }
        // Повідомляємо Namespace, що кімнату можна видалити зі сховища
        this.#namespace.checkAndRemoveEmptyRoom(this.name)
        this.#logger.info(`Кімнату '${this.name}' в просторі '${this.#namespace.path}' знищено.`)
        this.emit('destroyed', this.name) // Емітуємо подію про знищення (якщо хтось її слухає)
    }

    /**
     * Запускає періодичні оновлення для кімнати.
     * @private
     */
    async #startUpdates() {
        if (
            this.#intervalId ||
            !this.#options.updateCallback ||
            this.#options.updateIntervalMs <= 0
        ) {
            return // Не запускаємо, якщо вже запущено, немає callback або інтервал не дійсний
        }

        const runUpdate = async () => {
            // Якщо клієнтів немає, зупиняємо оновлення та знищуємо кімнату
            if (this.#clientIds.size === 0) {
                this.#logger.debug(`[Room:${this.name}] Немає клієнтів, зупинка оновлень.`)
                this.destroy()
                return
            }

            try {
                // Збираємо Set активних об'єктів Client для передачі в callback
                const activeClients = new Set()
                this.#clientIds.forEach((id) => {
                    const client = this.#namespace.getClientById(id)
                    if (client && client.ws.readyState === client.ws.OPEN) {
                        // Перевіряємо, чи з'єднання відкрите
                        activeClients.add(client)
                    }
                })

                if (activeClients.size === 0) {
                    this.#logger.warn(
                        `[Room:${this.name}] Немає активних клієнтів для оновлення. Можлива зупинка.`,
                    )
                    // Можливо, тут також варто викликати this.destroy(), якщо всі активні клієнти вийшли
                    return
                }

                // Викликаємо callback для отримання даних
                const data = await this.#options.updateCallback(this.name, activeClients)
                if (data !== null && data !== undefined) {
                    // Розсилаємо дані клієнтам (використовуємо 'roomUpdate' як стандартну подію)
                    this.broadcast('roomUpdate', { room: this.name, data: data })
                }
            } catch (error) {
                this.#logger.error(
                    `[Room:${this.name}] Помилка під час виконання updateCallback: ${error.message}`,
                    error,
                )
                // Можна емітувати подію помилки, щоб її обробили вище
                this.emit('error', error)
            }
        }

        // Запускаємо початкове оновлення, якщо налаштовано
        if (this.#options.runInitialUpdate) {
            this.#logger.info(`[Room:${this.name}] Запуск початкового оновлення.`)
            await runUpdate() // Чекаємо, поки початкове оновлення завершиться
        }

        // Запускаємо інтервал
        this.#intervalId = setInterval(runUpdate, this.#options.updateIntervalMs)
        this.#logger.info(
            `Інтервал оновлень для кімнати '${this.name}' запущено (${
                this.#options.updateIntervalMs
            } мс).`,
        )
    }
}

export default Room
