/**
 * @fileoverview Реалізація патерну Pub/Sub (Publisher/Subscriber) - (Observer Pattern)
 * для керування подіями в межах одного застосунку Node.js.
 */

/**
 * Клас PubSub реалізує брокера подій, що дозволяє компонентам
 * спілкуватися між собою через події без прямої залежності.
 */
class InMemoryPubSub {
    /**
     * Створює екземпляр PubSub.
     * @param {object | null} [logger=null] - Опціональний об'єкт логування.
     */
    constructor(logger = null) {
        /**
         * Об'єкт для зберігання підписників.
         * Ключі – назви подій (топіки), значення – масиви функцій зворотного виклику.
         * @type {Map<string, Array<Function>>}
         */
        this.events = new Map()

        /**
         * Екземпляр логера.
         * @type {object | null}
         */
        this.logger = logger

        this.logger?.trace(`Create new object fron PubSub class`)
    }

    /**
     * Підписатися на конкретну подію/топік.
     * @param {string} event - Назва події/топіка (наприклад, 'user:created').
     * @param {Function} callback - Функція зворотного виклику, яка буде виконана при публікації події.
     * @returns {{unsubscribe: Function}} Об'єкт з методом для легкого скасування підписки.
     */
    subscribe(event, callback) {
        if (!this.events.has(event)) {
            this.events.set(event, [])
        }

        // Перевірка на вже існуючу підписку (опціонально, для запобігання дублюванню)
        if (this.events[event].includes(callback)) {
            this.logger?.warn(`Callback вже підписаний на подію "${event}". Дублювання неможливе.`)
            return { unsubscribe: () => {} }
        }

        this.events.get(event).push(callback)
        this.logger?.info(
            `Підписано новий обробник на подію "${event}". Поточна кількість: ${this.events[event].length}`,
        )

        // Повертаємо об'єкт із замиканням на event та callback для зручного скасування підписки
        return {
            /**
             * Скасовує поточну підписку.
             */
            unsubscribe: () => this.unsubscribe(event, callback),
        }
    }

    /**
     * Опублікувати (викликати) подію для всіх підписників.
     * @param {string} event - Назва події/топіка.
     * @param {any} [data] - Дані (payload), які передаються всім підписникам.
     */
    publish(event, data) {
        const handlers = this.events[event]

        if (!handlers || handlers.length === 0) {
            this.logger?.info(`Подію "${event}" опубліковано, але активних підписників немає.`)
            return
        }

        this.logger?.info(`Публікація події "${event}" для ${handlers.length} підписників.`, data)

        // Створюємо копію масиву обробників для безпечної ітерації
        const handlersCopy = [...handlers]

        for (const callback of handlersCopy) {
            try {
                callback(data)
            } catch (error) {
                this.logger?.error(`ERROR in Pub/Sub handler for event "${event}":`, error)
            }
        }
    }

    /**
     * Скасувати конкретну підписку на подію.
     * Зазвичай використовується внутрішньо через метод, що повертається `subscribe()`.
     * @param {string} event - Назва події/топіка.
     * @param {Function} callback - Конкретна функція, яку потрібно видалити з підписок.
     */
    unsubscribe(event, callback) {
        if (!this.events[event]) {
            this.logger?.warn(`Спроба скасувати підписку на неіснуючу подію "${event}".`)
            return
        }

        const initialLength = this.events[event].length
        // Фільтруємо масив, залишаючи тільки ті функції, які не збігаються з переданою callback
        this.events[event] = this.events[event].filter((fn) => fn !== callback)
        const finalLength = this.events[event].length

        if (initialLength === finalLength) {
            this.logger?.warn(
                `Не вдалося знайти та скасувати підписку на подію "${event}". Можливо, callback не був зареєстрований.`,
            )
        } else {
            this.logger?.info(
                `Скасовано підписку на подію "${event}". Залишилось обробників: ${finalLength}`,
            )
        }

        // Очистити масив повністю, якщо він порожній після видалення
        if (this.events[event].length === 0) {
            delete this.events[event]
        }
    }

    /**
     * Очищає всі підписки на всі події.
     * Корисно для тестування або при завершенні роботи застосунку.
     */
    clearAllSubscriptions() {
        this.events = {}
        this.logger?.info('All Pub/Sub subscriptions cleared.')
    }
}

// Експортуємо сам клас, щоб користувач міг створити власний екземпляр
export default InMemoryPubSub

// Приклад використання єдиного екземпляра (singleton) в іншому файлі:
// import InMemoryPubSub from './InMemoryPubSub.js';
// const eventBroker = new InMemoryPubSub(console); // Передаємо console як простий логер
