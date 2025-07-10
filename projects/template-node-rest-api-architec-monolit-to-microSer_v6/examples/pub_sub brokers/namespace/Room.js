// src/namespaces/Room.js

/**
 * @callback MessageCallback
 * @param {object|string|number|boolean} message - Отримане повідомлення.
 * @param {string} senderId - ID інстансу, який відправив повідомлення (якщо передано).
 */

/**
 * @class Room
 * @description Представляє комунікаційну кімнату всередині простору імен.
 * Дозволяє інстансам приєднуватися, надсилати та отримувати повідомлення.
 */
class Room {
    /**
     * @param {string} name - Ім'я кімнати (наприклад, 'general', 'lobby').
     * @param {string} topic - Повний топік брокера для цієї кімнати (включаючи префікс простору імен).
     * @param {import('../brokers/MessageBroker.js').default} broker - Екземпляр брокера повідомлень.
     * @param {object} logger - **ОБОВ'ЯЗКОВО**: Екземпляр логера.
     */
    constructor(name, topic, broker, logger) {
        if (!name || !topic || !broker) {
            throw new Error('Room name, topic, and broker instance are required.')
        }
        // <-- Додана перевірка на обов'язкову наявність логера
        if (!logger || typeof logger.info !== 'function') {
            throw new Error(
                'Logger instance (with info, warn, error, debug methods) is required for Room.',
            )
        }

        this.name = name
        this.topic = topic
        this.broker = broker
        // autoDeleteEmpty
        this.logger = logger // Тепер logger завжди надається через DI
        /**
         * @private
         * @type {Set<string>}
         * @description Зберігає ID інстансів, які приєднані до цієї кімнати.
         */
        this.members = new Set()
        /**
         * @private
         * @type {Map<string, MessageCallback>}
         * @description Зберігає колбеки для кожного приєднаного інстансу,
         * щоб можна було викликати їх при отриманні повідомлення.
         */
        this.callbacks = new Map() // instanceId -> callback

        this._brokerMessageListener = (message) => {
            this.logger.debug(`Room received message:`, message)
            this.callbacks.forEach((callback) => {
                callback(message, message.senderId)
            })
        }

        this.logger.info(`Room '${this.name}' created with topic '${this.topic}'.`)
    }

    /**
     * @method join
     * @description Додає інстанс до кімнати та реєструє його колбек для повідомлень.
     * @param {string} instanceId - ID інстансу, що приєднується.
     * @param {MessageCallback} callback - Функція, яка буде викликана при отриманні повідомлення в цій кімнаті.
     * @returns {Promise<void>}
     */
    async join(instanceId, callback) {
        // ... (решта методів без змін, використовують this.logger)
        if (this.members.has(instanceId)) {
            this.logger.warn(`Instance '${instanceId}' is already in room '${this.name}'.`)
            return
        }

        if (this.members.size === 0) {
            await this.broker.subscribe(this.topic, this._brokerMessageListener)
            this.logger.info(`Room '${this.name}' subscribed to broker topic '${this.topic}'.`)
        }

        this.members.add(instanceId)
        this.callbacks.set(instanceId, callback)
        this.logger.info(
            `Instance '${instanceId}' joined room '${this.name}'. Total members: ${this.members.size}`,
        )
    }

    /**
     * @method leave
     * @description Видаляє інстанс з кімнати.
     * @param {string} instanceId - ID інстансу, що залишає кімнату.
     * @returns {Promise<void>}
     */
    async leave(instanceId) {
        if (!this.members.has(instanceId)) {
            this.logger.warn(`Instance '${instanceId}' is not in room '${this.name}'.`)
            return
        }

        this.members.delete(instanceId)
        this.callbacks.delete(instanceId)
        this.logger.info(
            `Instance '${instanceId}' left room '${this.name}'. Total members: ${this.members.size}`,
        )

        if (this.members.size === 0) {
            await this.broker.unsubscribe(this.topic, this._brokerMessageListener)
            this.logger.info(`Room '${this.name}' unsubscribed from broker topic '${this.topic}'.`)
        }
    }

    /**
     * @method publish
     * @description Надсилає повідомлення в цю кімнату.
     * @param {object|string|number|boolean} message - Повідомлення для надсилання.
     * @param {string} senderId - ID інстансу, який надсилає повідомлення.
     * @returns {Promise<void>}
     */
    async publish(message, senderId) {
        if (!this.members.has(senderId)) {
            this.logger.warn(
                `Instance '${senderId}' is not a member of room '${this.name}'. Message not sent.`,
            )
            return
        }
        const messageToSend = {
            ...message,
            senderId: senderId,
            room: this.name,
            namespace: this.topic.split('/')[1],
        }
        this.logger.debug(
            `Publishing message from '${senderId}' to room '${this.name}' (topic: '${this.topic}'):`,
            message,
        )
        await this.broker.publish(this.topic, messageToSend)
    }

    /**
     * @method getMembers
     * @description Повертає список ID інстансів, що знаходяться в цій кімнаті.
     * @returns {string[]} Масив ID учасників.
     */
    getMembers() {
        return Array.from(this.members)
    }

    /**
     * @method removeAllSubscribers
     * @description Відписує всіх учасників та видаляє основний слухач брокера.
     * @returns {Promise<void>}
     */
    async removeAllSubscribers() {
        if (this.members.size > 0) {
            this.logger.warn(
                `Room '${this.name}' is being cleared. Forcibly removing ${this.members.size} members.`,
            )
            this.members.clear()
            this.callbacks.clear()
        }
        if (this.broker && this.topic) {
            await this.broker.unsubscribe(this.topic, this._brokerMessageListener)
            this.logger.info(
                `Room '${this.name}' fully unsubscribed from broker topic '${this.topic}'.`,
            )
        }
    }
}

export default Room
