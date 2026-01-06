/**
 * RegistryFactory — динамічна фабрика для реєстрації та створення різних реалізацій.
 * Дозволяє обирати потрібну реалізацію за ключем без використання switch/if,
 * забезпечуючи швидкість пошуку O(1) та легке розширення системи.
 *
 * @example
 * // Приклад з драйверами сховищ
 * const storageFactory = new RegistryFactory({ logger: console });
 *
 * storageFactory.register('s3', S3Storage);
 * storageFactory.register('local', LocalStorage);
 *
 * // Створення нового екземпляра кожного разу
 * const s3 = storageFactory.create('s3', { bucket: 'uploads' });
 *
 * // Отримання синглтона (створюється один раз, потім повертається з кешу)
 * const db = storageFactory.resolve('local', { path: './data' });
 */
export class RegistryFactory {
    /** @type {Map<string, Function|Class>} */
    #registry = new Map()

    /** @type {Map<string, Object>} */
    #instanceCache = new Map()

    /** @type {boolean} */
    #isDestroyed = false

    /** @type {Object|null} */
    #logger = null

    /**
     * @param {Object} [options] - Параметри ініціалізації.
     * @param {Object} [options.logger] - Об'єкт логера (підтримка .info, .debug, .error, .child).
     */
    constructor({ logger = null } = {}) {
        this.#logger = logger?.child ? logger.child({ component: this.constructor.name }) : logger

        this.#logger?.info?.(`${this.constructor.name} initialized`)
    }

    /* ===============================
     * Public API
     * =============================== */

    /**
     * Реєструє реалізацію (клас або функцію-конструктор) під унікальним ключем.
     *
     * @param {string} key - Унікальний ідентифікатор типу.
     * @param {Function} implementation - Клас або функція-конструктор.
     * @returns {this} Повертає екземпляр фабрики для ланцюжкових викликів.
     * @throws {TypeError} Якщо ключ не є рядком або реалізація не є функцією.
     *
     * @example
     * factory.register('json', JSONParser).register('xml', XMLParser);
     */
    register(key, implementation) {
        this.#assertAlive()

        if (typeof key !== 'string' || !key) {
            throw new TypeError(`${this.constructor.name}: Key must be a non-empty string`)
        }
        if (typeof implementation !== 'function') {
            throw new TypeError(
                `${this.constructor.name}: Implementation must be a function or class`,
            )
        }

        this.#registry.set(key, implementation)

        this.#logger?.debug?.(`${this.constructor.name}: Registered implementation for [${key}]`)

        return this
    }

    /**
     * Створює новий екземпляр зареєстрованої реалізації.
     * Кожен виклик повертає новий об'єкт.
     *
     * @param {string} key - Ключ реалізації.
     * @param {...any} args - Аргументи, що передаються в конструктор.
     * @returns {Object} Екземпляр створеного об'єкта.
     * @throws {Error} Якщо реалізація за таким ключем не знайдена.
     *
     * @example
     * const parser = factory.create('json');
     */
    create(key, ...params) {
        this.#assertAlive()

        const Implementation = this.#registry.get(key)

        if (!Implementation) {
            const error = new Error(
                `${this.constructor.name}: No implementation registered for [${key}]`,
            )
            this.#logger?.error?.(error.message)
            throw error
        }

        this.#logger?.debug?.(`${this.constructor.name}: Creating instance for [${key}]`)

        try {
            // Повертаємо новий екземпляр
            return new Implementation(...params)
        } catch (error) {
            this.#logger?.error?.(`${this.constructor.name}: Failed to instantiate [${key}]`, {
                message: error.message,
            })
            throw error
        }
    }

    /**
     * Повертає існуючий екземпляр з кешу або створює новий (патерн Singleton).
     * Якщо об'єкт вже був створений раніше, повернеться той самий екземпляр.
     *
     * @param {string} key - Ключ реалізації.
     * @param {...any} args - Аргументи (використовуються лише при першому створенні).
     * @returns {Object} Екземпляр об'єкта.
     *
     * @example
     * const parser = factory.resolve('json');
     */
    resolve(key, ...args) {
        if (this.#instanceCache.has(key)) {
            return this.#instanceCache.get(key)
        }

        const instance = this.create(key, ...args)
        this.#instanceCache.set(key, instance)
        return instance
    }

    /**
     * Перевіряє, чи зареєстрована реалізація за вказаним ключем.
     *
     * @param {string} key - Ключ для перевірки.
     * @returns {boolean}
     */
    has(key) {
        return this.#registry.has(key)
    }

    /**
     * Очищує список реєстрацій та кеш екземплярів.
     * @throws {Error} Якщо фабрику вже знищено.
     */
    clear() {
        this.#assertAlive()
        this.#registry.clear()
        this.#instanceCache.clear()

        this.#logger?.warn?.(`${this.constructor.name}: All registrations cleared`)
    }

    /**
     * Знищує фабрику, очищуючи пам'ять та блокуючи подальше використання.
     */
    destroy() {
        if (this.#isDestroyed) return
        this.#isDestroyed = true

        this.#registry.clear()
        this.#instanceCache.clear()

        this.#logger?.info?.(`${this.constructor.name} destroyed`)
        this.#logger = null
    }

    /* ===============================
     * Internal helpers
     * =============================== */

    /** @private */
    #assertAlive() {
        if (this.#isDestroyed) {
            throw new Error(`${this.constructor.name} is destroyed`)
        }
    }
}
