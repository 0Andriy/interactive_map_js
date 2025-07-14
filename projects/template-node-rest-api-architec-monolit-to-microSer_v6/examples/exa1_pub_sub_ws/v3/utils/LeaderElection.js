import { IStorage } from '../storage/IStorage.js'

/**
 * @class LeaderElection
 * @description Реалізує механізм вибору лідера за допомогою розподіленого блокування в Redis.
 */
class LeaderElection {
    #storage
    #logger
    #instanceId
    #leaderKey
    #ttlMs // Час життя блокування лідера в мілісекундах
    #renewalIntervalMs // Інтервал для оновлення блокування
    #leaderRenewalTimer = null
    #isLeader = false

    /**
     * @param {IStorage} storage - Екземпляр сховища (RedisStorage) для блокування.
     * @param {object} logger - Екземпляр логера.
     * @param {string} instanceId - Унікальний ID цього інстансу (наприклад, UUID).
     * @param {string} leaderKey - Ключ в сховищі, що позначає лідера (наприклад, 'global_leader').
     * @param {number} ttlMs - Час життя блокування лідера в мілісекундах (наприклад, 10000 для 10 секунд).
     * @param {number} renewalIntervalMs - Інтервал для оновлення блокування в мілісекундах (наприклад, 3000 для 3 секунд).
     */
    constructor(
        storage,
        logger,
        instanceId,
        leaderKey = 'global_leader',
        ttlMs = 1000 * 10,
        renewalIntervalMs = 3000,
    ) {
        if (!(storage instanceof IStorage)) {
            throw new Error('Storage must be an instance of IStorage.')
        }

        this.#storage = storage
        this.#logger = logger
        this.#instanceId = instanceId
        this.#leaderKey = leaderKey
        this.#ttlMs = ttlMs
        this.#renewalIntervalMs = renewalIntervalMs
        this.#logger.info(
            `LeaderElection initialized for instance '${instanceId}' with key '${leaderKey}'.`,
        )
    }

    /**
     * Запускає процес вибору лідера та оновлення лідерства.
     */
    async start() {
        this.#logger.debug(`Instance '${this.#instanceId}' attempting to become leader...`)
        // Перша спроба стати лідером
        await this.#tryAcquireLeadership()
        // Запускаємо періодичну перевірку/оновлення лідерства
        this.#leaderRenewalTimer = setInterval(async () => {
            await this.#tryAcquireLeadership()
        }, this.#renewalIntervalMs)
    }

    /**
     * Припиняє участь у виборах лідера.
     */
    async stop() {
        if (this.#leaderRenewalTimer) {
            clearInterval(this.#leaderRenewalTimer)
            this.#leaderRenewalTimer = null
        }
        if (this.#isLeader) {
            this.#logger.warn(`Instance '${this.#instanceId}' is relinquishing leadership.`)
            try {
                // Видаляємо ключ, якщо він належить нашому інстансу
                await this.#storage.delete(this.#leaderKey)
            } catch (e) {
                this.#logger.error(`Failed to delete leader key on stop: ${e.message}`)
            }
            this.#isLeader = false
        }
        this.#logger.debug(`LeaderElection stopped for instance '${this.#instanceId}'.`)
    }

    /**
     * Перевіряє, чи є поточний інстанс лідером.
     * Використовує кешований стан.
     * @returns {boolean}
     */
    isLeader() {
        return this.#isLeader
    }

    /**
     * Виконує "живу" перевірку, чи є поточний інстанс лідером, звертаючись до сховища.
     * @returns {Promise<boolean>}
     */
    async checkIsLeader() {
        try {
            const currentLeaderId = await this.#storage.get(this.#leaderKey)
            return currentLeaderId === this.#instanceId
        } catch (error) {
            this.#logger.error('Failed to check leadership status:', error)
            return false
        }
    }

    /**
     * Приватний метод для спроби захоплення або оновлення лідерства.
     */
    async #tryAcquireLeadership() {
        try {
            // SETNX (SET if Not eXists) з TTL
            // Redis SET command with NX and PX (milliseconds) options
            const acquired = await this.#storage.set(
                this.#leaderKey,
                this.#instanceId,
                this.#ttlMs / 1000,
                { NX: true, PX: this.#ttlMs },
            )

            if (acquired) {
                if (!this.#isLeader) {
                    this.#isLeader = true
                    this.#logger.debug(`Instance '${this.#instanceId}' has become the leader.`)
                } else {
                    // Якщо вже були лідером, просто оновлюємо TTL
                    await this.#storage.set(this.#leaderKey, this.#instanceId, this.#ttlMs / 1000) // Оновлюємо, щоб не закінчився
                    this.#logger.debug(`Instance '${this.#instanceId}' renewed leadership.`)
                }
            } else {
                const currentLeaderId = await this.#storage.get(this.#leaderKey)

                if (currentLeaderId === this.#instanceId) {
                    // Це має бути оброблено гілкою 'acquired' раніше, але для надійності:
                    // оновлюємо, якщо ми - поточний лідер, а команда NX не спрацювала
                    await this.#storage.set(this.#leaderKey, this.#instanceId, this.#ttlMs / 1000)
                    if (!this.#isLeader) {
                        // Якщо з якихось причин попередній acquired не спрацював коректно
                        this.#isLeader = true
                        this.#logger.debug(
                            `Instance '${this.#instanceId}' confirmed as leader (re-checked).`,
                        )
                    } else {
                        this.#logger.debug(
                            `Instance '${this.#instanceId}' renewed leadership (re-check).`,
                        )
                    }
                } else {
                    // Ключ належить іншому інстансу
                    if (this.#isLeader) {
                        this.#isLeader = false
                        this.#logger.warn(
                            `Instance '${
                                this.#instanceId
                            }' lost leadership to '${currentLeaderId}'.`,
                        )
                    } else {
                        this.#logger.debug(
                            `Instance '${
                                this.#instanceId
                            }' is not the leader. Current leader: '${currentLeaderId}'.`,
                        )
                    }
                }
            }
        } catch (error) {
            this.#logger.error(
                `Error in leader election for instance '${this.#instanceId}':`,
                error,
            )
            if (this.#isLeader) {
                this.#isLeader = false // Припускаємо втрату лідерства при помилці
                this.#logger.warn(
                    `Instance '${this.#instanceId}' potentially lost leadership due to error.`,
                )
            }
        }
    }
}

export { LeaderElection }
