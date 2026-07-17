/**
 * @fileoverview Опис сховища в оперативній пам'яті з підтримкою TTL та атомарного блокування.
 */

/**
 * @typedef {Object} StorageOptions
 * @property {boolean} [NX] Встановити значення тільки якщо ключ не існує (атомарне блокування).
 * @property {number} [EX] Термін дії ключа в секундах (Time to Live).
 */

/**
 * @typedef {Object} StorageItem
 * @property {string} value Рядкове значення, що зберігається в кеші.
 * @property {number|null} expiry Мітка часу в мілісекундах, коли ключ застаріє.
 */

/**
 * Сховище даних в оперативній пам'яті.
 * Реалізує базовий інтерфейс для сумісності з Redis.
 *
 * @implements {IdempotencyStorage}
 */
export class MemoryStorage {
    constructor() {
        /**
         * Внутрішня мапа для збереження даних.
         * @private
         * @type {Map<string, StorageItem>}
         */
        this.store = new Map()
    }

    /**
     * Зберегти значення за ключем з додатковими опціями.
     *
     * @param {string} key Унікальний ключ.
     * @param {string} value Значення, яке потрібно зберегти.
     * @param {StorageOptions} [options={}] Опції збереження (NX, EX).
     * @returns {Promise<'OK'|null>} Повертає 'OK' у разі успіху, або null, якщо спрацював прапорець NX.
     */
    async set(key, value, options = {}) {
        const now = Date.now()

        if (options.NX && this.store.has(key)) {
            const existing = this.store.get(key)
            // Якщо ключ є, але його термін дії вже минув — дозволяємо перезапис
            if (existing.expiry && existing.expiry < now) {
                this.store.delete(key)
            } else {
                return null // Повертаємо null, бо заблоковано
            }
        }

        const expiry = options.EX ? now + options.EX * 1000 : null
        this.store.set(key, { value, expiry })

        // Автоматичне видалення після закінчення TTL
        if (options.EX) {
            setTimeout(() => this.del(key), options.EX * 1000).unref()
        }

        return 'OK'
    }

    /**
     * Отримати значення за ключем.
     *
     * @param {string} key Унікальний ключ.
     * @returns {Promise<string|null>} Рядкове значення або null, якщо ключ не знайдено або застарів.
     */
    async get(key) {
        const item = this.store.get(key)
        if (!item) return null

        if (item.expiry && item.expiry < Date.now()) {
            this.store.delete(key)
            return null
        }

        return item.value
    }

    /**
     * Видалити ключ зі сховища.
     *
     * @param {string} key Унікальний ключ для видалення.
     * @returns {Promise<boolean>} Повертає true, якщо ключ існував і був видалений.
     */
    async del(key) {
        return this.store.delete(key)
    }
}
