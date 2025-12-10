/**
 * @fileoverview Основний файл програми, що демонструє використання асинхронного PubSub через фабрику та DI.
 * Відповідає за визначення глобальних конфігурацій та залежностей.
 */

import EventBrokerFactory from './services/event-broker/EventBrokerFactory.js'
import EventBrokerInterface from './services/event-broker/interfaces/EventBrokerInterface.js'

// --- Глобальні Залежності та Конфігурація (припустимо, надходять ззовні) ---

/**
 * @const {object} Глобальний об'єкт логгера.
 */
const GLOBAL_LOGGER = {
    info: (msg) => console.log(`[INFO/APP] ${msg}`),
    error: (msg, err) => console.error(`[ERROR/APP] ${msg}`, err),
}

/**
 * @const {object} Конфігурація програми, що визначає тип брокера.
 */
const APP_CONFIG = {
    type: 'local', // <- Використовуємо локальний асинхронний Singleton
    env: 'development',
}

/**
 * @const {object | null} Мок/Заглушка клієнта Redis.
 */
const MOCK_REDIS_CLIENT = {
    on: () => {},
    publish: () => {},
    subscribe: () => {},
    unsubscribe: () => {},
}
// -------------------------------------------------------------------------

// --- Компоненти програми, які використовують брокер (Видавець/Підписник) ---

/**
 * Сервіс реєстрації користувачів (Видавець).
 */
class RegistrationService {
    /**
     * @param {EventBrokerInterface} eventBroker Інжектований брокер подій.
     */
    constructor(eventBroker) {
        this.eventBroker = eventBroker
    }

    /**
     * Реєструє нового користувача та публікує подію.
     * Завдяки асинхронному publish, цей метод завершується швидко.
     */
    registerUser(name, email) {
        console.log(
            `\n[RegistrationService]: Початок реєстрації користувача ${name}... (Синхронна частина)`,
        )
        const userData = { name, email, timestamp: new Date().toISOString() }
        // Публікуємо подію. publish завершиться миттєво, не чекаючи обробників.
        this.eventBroker.publish('user:registered', userData)
        console.log(
            `[RegistrationService]: Метод registerUser завершив свою роботу. (Синхронна частина)`,
        )
    }
}

/**
 * Сервіс розсилки листів (Підписник).
 */
class MailerService {
    /**
     * @param {EventBrokerInterface} eventBroker Інжектований брокер подій.
     */
    constructor(eventBroker) {
        this.eventBroker = eventBroker
    }

    /**
     * Налаштовує підписку на подію реєстрації.
     */
    setupSubscriptions() {
        // Підписуємося на подію через інжектований брокер
        this.eventBroker.subscribe('user:registered', (userData) => {
            // Цей код виконається асинхронно, пізніше, завдяки Event Loop
            console.log(
                `[MailerService]: Надсилання привітального листа на адресу: ${userData.email}`,
            )
        })
    }
}

// --- Ініціалізація програми ---

// 1. Отримуємо потрібний екземпляр брокера через Фабрику, передаючи залежності
const eventBrokerInstance = EventBrokerFactory.createBroker(
    APP_CONFIG,
    GLOBAL_LOGGER,
    MOCK_REDIS_CLIENT,
)

// 2. Ініціалізуємо сервіси, передаючи їм екземпляр брокера (Ін'єкція Залежностей)
const registrationService = new RegistrationService(eventBrokerInstance)
const mailerService = new MailerService(eventBrokerInstance)

// 3. Налаштовуємо підписки
mailerService.setupSubscriptions()

// 4. Запускаємо основну логіку (це ініціює подію publish)
registrationService.registerUser('Іван', 'ivan@example.com')

console.log('\n--- Демонстрація відписки ---')

/**
 * Функція-колбек для демонстрації глобальної відписки.
 */
const statusCallback = (data) => console.log(`[StatusLogger]: ${data.message}`)
const statusSubscription = eventBrokerInstance.subscribe('system:status', statusCallback)

eventBrokerInstance.publish('system:status', { message: 'Статус ОК, буде залоговано' })

// Відписка з використанням токена, отриманого при підписці
statusSubscription.unsubscribe()

eventBrokerInstance.publish('system:status', { message: 'Це повідомлення вже не буде видно' })
