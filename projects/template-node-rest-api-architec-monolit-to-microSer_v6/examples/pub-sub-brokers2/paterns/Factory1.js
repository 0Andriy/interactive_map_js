// VehicleFactory.js (Максимально ефективна версія)
import { Car, Motorcycle } from './interfaces.js'

/**
 * Реєстр доступних типів транспортних засобів.
 * Використання об'єкта або Map для зберігання конструкторів
 * усуває потребу в громіздкому switch/case і робить пошук миттєвим (O(1)).
 */
const VehicleRegistry = {
    car: Car,
    motorcycle: Motorcycle,
}

/**
 * Клас VehicleFactory використовує реєстр для ефективного створення об'єктів.
 */
class VehicleFactory {
    /**
     * Фабричний метод, який створює об'єкт на основі типу та конфігурації.
     * @param {string} type - Тип транспортного засобу ('car' або 'motorcycle').
     * @param {object} [config={}] - Об'єкт конфігурації для продукту (наприклад, { color: 'red' }).
     * @returns {Car | Motorcycle} Екземпляр конкретного транспортного засобу.
     * @throws {Error} Якщо тип не підтримується.
     */
    createVehicle(type, config = {}) {
        const VehicleClass = VehicleRegistry[type.toLowerCase()]

        if (!VehicleClass) {
            throw new Error(
                `Невідомий тип транспортного засобу: ${type}. Підтримувані типи: ${Object.keys(
                    VehicleRegistry,
                ).join(', ')}.`,
            )
        }

        // Миттєво інстанціюємо потрібний клас і передаємо йому конфіг
        return new VehicleClass(config)
    }
}

export default VehicleFactory
