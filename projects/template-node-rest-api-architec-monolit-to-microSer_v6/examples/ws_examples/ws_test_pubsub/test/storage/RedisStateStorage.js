// src/storage/RedisStateStorage.js

import { IStateStorage } from './IStateStorage.js'
// import { createClient } from 'redis'; // Якщо використовуєте 'redis' v4+
// import Redis from 'ioredis'; // Якщо використовуєте 'ioredis'

/**
 * Заглушка для реалізації сховища стану на базі Redis.
 * Кидає помилки, якщо методи викликаються, поки не буде реалізована.
 * @implements {IStateStorage}
 */
class RedisStateStorage extends IStateStorage {
    constructor(config = {}, logger = console) {
        super(logger)
        this.config = config // Конфігурація Redis
        /** @type {any} */ // Замініть 'any' на тип вашого Redis клієнта
        this.redisClient = null // Тут буде клієнт Redis
        /** @type {any} */ // Замініть 'any' на тип вашого Redis клієнта для Pub/Sub
        this.redisSubscriber = null // Окремий клієнт для Pub/Sub
        this.subscriptionCallbacks = new Map() // Map<channel, Set<callback>> для Pub/Sub

        this.logger.warn(
            'RedisStateStorage ініціалізовано як ЗАГЛУШКА. Не готовий до використання.',
        )
        this.logger.debug('Конфігурація Redis (заглушка):', this.config)
    }

    /**
     * Метод для підключення до Redis.
     * Його потрібно буде реалізувати при переході на Redis.
     * @returns {Promise<boolean>}
     */
    async connect() {
        this.logger.warn("Метод 'connect()' RedisStateStorage ЗАГЛУШКА. Потрібна реалізація!")
        /*
        // Приклад реалізації з 'ioredis':
        try {
            this.redisClient = new Redis(this.config);
            this.redisSubscriber = new Redis(this.config); // Окремий клієнт для Pub/Sub

            this.redisClient.on('error', (err) => this.logger.error('Redis Client Error', err));
            this.redisSubscriber.on('error', (err) => this.logger.error('Redis Subscriber Error', err));

            // Обробка вхідних повідомлень Pub/Sub
            this.redisSubscriber.on('message', (channel, message) => {
                const callbacks = this.subscriptionCallbacks.get(channel);
                if (callbacks) {
                    try {
                        const parsedMessage = JSON.parse(message);
                        callbacks.forEach(cb => cb(channel, parsedMessage));
                    } catch (e) {
                        this.logger.error(`Failed to parse Redis message on channel ${channel}:`, e);
                    }
                }
            });

            await this.redisClient.ping();
            await this.redisSubscriber.ping();
            this.logger.info("Підключено до Redis.");
            return true;
        } catch (error) {
            this.logger.error("Помилка підключення до Redis:", error);
            return false;
        }
        */
        return Promise.resolve(true)
    }

    // --- Клієнти ---
    async addClient(clientInfo) {
        throw new Error("Method 'addClient()' RedisStateStorage not implemented.")
    }
    async getClient(clientId) {
        throw new Error("Method 'getClient()' RedisStateStorage not implemented.")
    }
    async removeClient(clientId) {
        throw new Error("Method 'removeClient()' RedisStateStorage not implemented.")
    }
    async getClientsByUserId(userId) {
        throw new Error("Method 'getClientsByUserId()' RedisStateStorage not implemented.")
    }
    async getAllClients() {
        throw new Error("Method 'getAllClients()' RedisStateStorage not implemented.")
    }
    async clientExists(clientId) {
        throw new Error("Method 'clientExists()' RedisStateStorage not implemented.")
    }

    // --- Неймспейси ---
    async addNamespace(namespacePath, namespaceInfo) {
        throw new Error("Method 'addNamespace()' RedisStateStorage not implemented.")
    }
    async getNamespace(namespacePath) {
        throw new Error("Method 'getNamespace()' RedisStateStorage not implemented.")
    }
    async namespaceExists(namespacePath) {
        throw new Error("Method 'namespaceExists()' RedisStateStorage not implemented.")
    }
    async removeNamespace(namespacePath) {
        throw new Error("Method 'removeNamespace()' RedisStateStorage not implemented.")
    }
    async getAllNamespaces() {
        throw new Error("Method 'getAllNamespaces()' RedisStateStorage not implemented.")
    }

    // --- Кімнати ---
    async addRoom(namespacePath, roomInfo) {
        throw new Error("Method 'addRoom()' RedisStateStorage not implemented.")
    }
    async getRoom(namespacePath, roomId) {
        throw new Error("Method 'getRoom()' RedisStateStorage not implemented.")
    }
    async removeRoom(namespacePath, roomId) {
        throw new Error("Method 'removeRoom()' RedisStateStorage not implemented.")
    }
    async roomExists(namespacePath, roomId) {
        throw new Error("Method 'roomExists()' RedisStateStorage not implemented.")
    }
    async getRoomsByNamespace(namespacePath) {
        throw new Error("Method 'getRoomsByNamespace()' RedisStateStorage not implemented.")
    }
    async addClientToRoom(namespacePath, roomId, clientId) {
        throw new Error("Method 'addClientToRoom()' RedisStateStorage not implemented.")
    }
    async removeClientFromRoom(namespacePath, roomId, clientId) {
        throw new Error("Method 'removeClientFromRoom()' RedisStateStorage not implemented.")
    }
    async getClientsInRoom(namespacePath, roomId) {
        throw new Error("Method 'getClientsInRoom()' RedisStateStorage not implemented.")
    }
    async countClientsInRoom(namespacePath, roomId) {
        throw new Error("Method 'countClientsInRoom()' RedisStateStorage not implemented.")
    }

    // --- Pub/Sub ---
    async publish(channel, message) {
        this.logger.debug(
            `[Redis Stub] Publishing to ${channel}: ${JSON.stringify(message).substring(
                0,
                100,
            )}...`,
        )
        // if (this.redisClient) {
        //     return this.redisClient.publish(channel, JSON.stringify(message)).then(() => true);
        // }
        throw new Error("Method 'publish()' RedisStateStorage not implemented.")
    }

    async subscribe(channel, callback) {
        this.logger.debug(`[Redis Stub] Subscribing to ${channel}.`)
        if (!this.subscriptionCallbacks.has(channel)) {
            this.subscriptionCallbacks.set(channel, new Set())
            // if (this.redisSubscriber) {
            //     await this.redisSubscriber.subscribe(channel);
            // }
        }
        this.subscriptionCallbacks.get(channel).add(callback)
        // throw new Error("Method 'subscribe()' RedisStateStorage not implemented.");
        return Promise.resolve(true)
    }

    async unsubscribe(channel, callback) {
        this.logger.debug(`[Redis Stub] Unsubscribing from ${channel}.`)
        const callbacks = this.subscriptionCallbacks.get(channel)
        if (callbacks) {
            callbacks.delete(callback)
            if (callbacks.size === 0) {
                this.subscriptionCallbacks.delete(channel)
                // if (this.redisSubscriber) {
                //     await this.redisSubscriber.unsubscribe(channel);
                // }
            }
        }
        // throw new Error("Method 'unsubscribe()' RedisStateStorage not implemented.");
        return Promise.resolve(true)
    }

    // --- Загальні методи ---
    async clearAll() {
        throw new Error("Method 'clearAll()' RedisStateStorage not implemented.")
    }

    async disconnect() {
        this.logger.info('RedisStateStorage: Імітація відключення.')
        /*
        if (this.redisClient) {
            await this.redisClient.quit();
            this.redisClient = null;
        }
        if (this.redisSubscriber) {
            await this.redisSubscriber.quit();
            this.redisSubscriber = null;
        }
        */
        return Promise.resolve(true)
    }
}

export { RedisStateStorage }
