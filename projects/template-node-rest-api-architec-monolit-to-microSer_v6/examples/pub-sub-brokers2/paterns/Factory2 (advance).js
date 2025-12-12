/**
 * @fileoverview Універсальна фабрика об'єктів, яка працює з динамічним реєстром.
 */

class GenericFactory {
    constructor() {
        /**
         * Приватний реєстр для зберігання конструкторів класів.
         * Ключ: {string} назва типу, Значення: {Function} конструктор класу.
         * @private
         * @type {Map<string, Function>}
         */
        this._registry = new Map()
    }

    /**
     * Реєструє новий клас у фабриці під унікальним ідентифікатором.
     * @param {string} type - Унікальний ідентифікатор типу (наприклад, 'car', 'user', 'pdfReport').
     * @param {Function} Constructor - Клас або функція-конструктор, яку потрібно зареєструвати.
     * @throws {Error} Якщо тип вже зареєстрований або конструктор не є функцією.
     */
    register(type, Constructor) {
        if (typeof Constructor !== 'function') {
            throw new Error(`Конструктор для типу "${type}" має бути функцією (класом).`)
        }
        if (this._registry.has(type)) {
            throw new Error(`Тип "${type}" вже зареєстрований у фабриці.`)
        }
        this._registry.set(type, Constructor)
        console.log(`[Factory] Зареєстровано новий тип: "${type}"`)
    }

    /**
     * Створює новий екземпляр зареєстрованого класу, використовуючи наданий конфіг.
     * @param {string} type - Ідентифікатор типу, який потрібно створити.
     * @param {object} [config={}] - Об'єкт конфігурації/параметрів, що передається в конструктор.
     * @returns {object} Новий екземпляр об'єкта.
     * @throws {Error} Якщо запитаний тип не зареєстрований.
     */
    create(type, config = {}) {
        const Constructor = this._registry.get(type)

        if (!Constructor) {
            throw new Error(
                `Невідомий тип об'єкта: "${type}". Переконайтеся, що він зареєстрований.`,
            )
        }

        // Використовуємо оператор 'new' для інстанціювання знайденого класу, передаючи конфіг
        return new Constructor(config)
    }
}

// Експортуємо єдиний екземпляр універсальної фабрики для використання в усьому застосунку (Singleton)
export default new GenericFactory()
