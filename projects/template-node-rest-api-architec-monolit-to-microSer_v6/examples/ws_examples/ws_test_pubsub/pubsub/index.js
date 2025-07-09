// pubsub/index.js (Оновлений файл для реєстрації брокерів)
import { PubSubService } from './interface-pubsub.js'
import { InMemoryPubSub } from './in-memory-pubsub.js'
import { RedisPubSub } from './redis-pubsub.js'

/**
 * Перелік підтримуваних типів брокерів повідомлень.
 * @readonly
 * @enum {string}
 */
export const BROKER_TYPES = {
    IN_MEMORY: 'in-memory',
    REDIS: 'redis',
}

/**
 * @typedef {object} PubSubCommonOptions
 * @property {Console} [logger=console] - Об'єкт логера.
 */

/**
 * @typedef {PubSubCommonOptions} InMemoryPubSubOptions
 */

/**
 * @typedef {PubSubCommonOptions & {url: string}} RedisPubSubOptions
 * @property {string} url - URL для підключення до Redis.
 * @property {string} [password] - Пароль для автентифікації Redis.
 * @property {object} [socket] - Додаткові опції сокета для підключення до Redis.
 */

/**
 * @typedef {object} CreatePubSubServiceOptions
 * @property {string} [brokerType] - Тип брокера, який потрібно створити.
 * @property {InMemoryPubSubOptions | RedisPubSubOptions | KafkaPubSubOptions} [brokerOptions] - Об'єкт з опціями.
 */

/**
 * @typedef {(options: any) => PubSubService} BrokerFactoryFunction
 */

/**
 * Внутрішній реєстр фабричних функцій для брокерів.
 * @type {{[type: string]: BrokerFactoryFunction}}
 */
const BROKER_FACTORIES = {}

/**
 * Реєструє фабричну функцію для створення екземпляра брокера.
 * Це центральний механізм розширення для додавання нових брокерів.
 * @param {string} type - Унікальний ідентифікатор типу брокера (наприклад, 'redis', 'kafka').
 * @param {BrokerFactoryFunction} factoryFunction - Функція, яка приймає опції та повертає екземпляр PubSubService.
 * @param {Console} [logger=console] - Логер для внутрішніх повідомлень реєстратора.
 */
export function registerBroker(type, factoryFunction, logger = console) {
    if (BROKER_FACTORIES[type]) {
        logger.warn(`[PubSub] Брокер типу '${type}' вже зареєстрований і буде перезаписаний.`)
    }
    BROKER_FACTORIES[type] = factoryFunction
}

/**
 * Створює і повертає екземпляр сервісу Pub/Sub на основі конфігурації.
 * @param {CreatePubSubServiceOptions} [options={}] - Опції конфігурації.
 * @returns {PubSubService} Екземпляр PubSub сервісу.
 * @throws {Error} Якщо brokerType не підтримується або відсутні необхідні опції.
 */
export function createPubSubService({
    brokerType = process.env.BROKER_TYPE || BROKER_TYPES.IN_MEMORY,
    brokerOptions = {},
} = {}) {
    const factoryFunction = BROKER_FACTORIES[brokerType]

    if (!factoryFunction) {
        throw new Error(
            `Непідтримуваний тип брокера: '${brokerType}'. ` +
                `Допустимі типи: ${Object.keys(BROKER_FACTORIES).join(', ')}. ` +
                `Переконайтеся, що брокер зареєстрований.`,
        )
    }

    // Додаємо спільні опції до brokerOptions перед передачею фабриці
    const finalBrokerOptions = {
        logger: brokerOptions.logger || console,
        ...brokerOptions,
    }

    return factoryFunction(finalBrokerOptions)
}

// Реєстрація стандартних брокерів при імпорті цього модуля.
// Цей блок є точкою, де ви "зв'язуєте" типи брокерів з їхніми реалізаціями.
registerBroker(BROKER_TYPES.IN_MEMORY, (options) => {
    return new InMemoryPubSub(options)
})

registerBroker(BROKER_TYPES.REDIS, (options) => {
    const redisUrl = options.url || process.env.REDIS_URL
    if (!redisUrl) {
        throw new Error(
            `Для типу брокера '${BROKER_TYPES.REDIS}' необхідно вказати 'options.url' або встановити REDIS_URL.`,
        )
    }
    return new RedisPubSub({ url: redisUrl, ...options })
})

// Зауваження: Якщо ви хочете мати глобальний екземпляр Pub/Sub (наприклад, для singleton-патерну
// в дуже простих додатках), ви можете створити його тут і експортувати за замовчуванням.
// Проте, у більших або більш тестовних архітектурах рекомендується викликати createPubSubService()
// напряму там, де вам потрібен сервіс, або використовувати механізм ін'єкції залежностей.
/*
const DEFAULT_PUBSUB_SERVICE = createPubSubService();
export default DEFAULT_PUBSUB_SERVICE;
*/
