import { JwtService } from './JwtService.js'

/**
 * Менеджер життєвого циклу JWT стратегій.
 * Забезпечує реєстрацію, зберігання, використання та видалення сервісів для різних типів токенів.
 * Патерн - Registry + Singleton + Strategy
 *
 * @example
 * // 1. Ініціалізація при старті додатка
 * await jwtManager.initialize({
 *   ACCESS: {
 *     id: 'access',
 *     options: { expiresIn: '15m' },
 *     getKeys: async () => ({ secret: '...', private_key: '...', public_key: '...' })
 *   }
 * });
 *
 * // 2. Використання в бізнес-логіці
 * const token = await jwtManager.use('access').sign({ userId: 1 });
 */
export class JwtManager {
    /**
     * Статичне поле для зберігання єдиного екземпляра
     * @type {JwtManager|null}
     * @private
     */
    static #instance = null

    /**
     * Приватний конструктор для запобігання прямому створенню через `new`.
     */
    constructor() {
        // Якщо інстанс вже є — повертаємо його
        if (JwtManager.#instance) {
            return JwtManager.#instance
            // throw new Error('Use JwtManager.getInstance() instead of new')
        }
        // Зберігаємо посилання на цей екземпляр
        JwtManager.#instance = this

        /**
         * Внутрішній реєстр сервісів
         * @type {Map<string, JwtService>}
         * @private
         */
        this.services = new Map()
    }

    /**
     * Основний метод для отримання єдиного екземпляра класу.
     * @returns {JwtManager}
     */
    static getInstance() {
        if (!JwtManager.#instance) {
            JwtManager.#instance = new JwtManager()
        }
        return JwtManager.#instance
    }

    /**
     * Реєструє нову стратегію та створює відповідний JwtService.
     * Якщо стратегія з таким ID вже існує, її буде перезаписано (Hot Swap).
     *
     * @param {Object} strategy - Конфігурація стратегії.
     * @param {string} strategy.id - Унікальний ідентифікатор (наприклад, 'access').
     * @param {Object} strategy.options - Налаштування за замовчуванням.
     * @param {Function} strategy.getKeys - Асинхронна функція, що повертає ключі.
     * @returns {Promise<JwtService>} Створений екземпляр сервісу.
     *
     * @example
     * await jwtManager.register({
     *   id: 'one_time_link',
     *   options: { expiresIn: '5m', algorithm: 'HS256' },
     *   getKeys: async () => ({ secret: 'my-secret' })
     * });
     */
    async register(strategy) {
        if (!strategy.id) {
            throw new Error('Strategy ID is required for registration')
        }

        const service = new JwtService({
            defaultOptions: strategy.options,
            keyResolver: strategy.keyProvider,
        })

        this.services.set(strategy.id, service)
        return service
    }

    /**
     * Видаляє стратегію з реєстру.
     *
     * @param {string} id - Ідентифікатор стратегії.
     * @returns {boolean} True, якщо стратегію було видалено.
     *
     * @example
     * jwtManager.unregister('access');
     */
    unregister(id) {
        return this.services.delete(id)
    }

    /**
     * Отримує сервіс за його ідентифікатором.
     *
     * @param {string} id - Ідентифікатор стратегії.
     * @returns {JwtService} Екземпляр сервісу.
     *
     * @example
     * const { payload } = await jwtManager.use('access').verify(token);
     */
    use(id) {
        const service = this.services.get(id)
        if (!service) {
            throw new Error(`JWT Strategy with id "${id}" is not registered in the system`)
        }
        return service
    }

    /**
     * Масова ініціалізація стратегій.
     *
     * @param {Object.<string, Object>} strategies - Об'єкт зі стратегіями.
     * @returns {Promise<void>}
     */
    async initialize(strategies) {
        for (const strategy of Object.values(strategies)) {
            await this.register(strategy)
        }
    }

    /**
     * Повністю очищує реєстр стратегій.
     */
    clearAll() {
        this.services.clear()
    }

    /**
     * Перевіряє, чи зареєстрована конкретна стратегія.
     *
     * @param {string} id - Ідентифікатор стратегії.
     * @returns {boolean}
     */
    has(id) {
        return this.services.has(id)
    }

    /**
     * Повертає список усіх зареєстрованих ідентифікаторів стратегій.
     *
     * @returns {string[]} Масив ID.
     */
    list() {
        return Array.from(this.services.keys())
    }

    /**
     * Високорівневий метод для генерації пари токенів (Access та Refresh).
     *
     * @param {Object} userPayload - Дані користувача для токена.
     * @param {Object} [options] - Додаткові налаштування для кожного типу.
     * @returns {Promise<{accessToken: string, refreshToken: string}>}
     *
     * @example
     * const tokens = await jwtManager.generateAuthPair(
     *   { sub: 'user_1', role: 'admin' },
     *   { refresh: { expiresIn: '7d' } }
     * );
     */
    async generateAuthPair(userPayload, options = {}) {
        const accessService = this.use('access')
        const refreshService = this.use('refresh')

        const accessToken = await accessService.sign(userPayload, options.access)
        const refreshToken = await refreshService.sign(userPayload, options.refresh)

        return { accessToken, refreshToken }
    }
}
