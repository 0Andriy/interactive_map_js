// ShippingCalculator.js (Context & Strategies)

// Призначення: Визначає сімейство алгоритмів, інкапсулює кожен із них і робить їх взаємозамінними. Це дозволяє динамічно змінювати поведінку об'єкта під час виконання програми.

// --- Стратегії (Алгоритми розрахунку доставки) ---

const upsStrategy = (weight, distance) => {
    // Складна логіка розрахунку UPS
    return weight * 0.5 + distance * 0.1
}

const fedexStrategy = (weight, distance) => {
    // Складна логіка розрахунку FedEx
    return weight * 0.6 + distance * 0.05 + 5 // Фіксована плата
}

const dhlStrategy = (weight, distance) => {
    // Складна логіка розрахунку DHL
    return weight * 0.4 + distance * 0.2
}

/**
 * Context (Контекст): Використовує обрану стратегію.
 */
class ShippingCalculator {
    constructor(strategy) {
        // Контекст зберігає посилання на поточну стратегію (функцію)
        this.strategy = strategy
    }

    setStrategy(newStrategy) {
        this.strategy = newStrategy
    }

    calculate(weight, distance) {
        // Делегує виконання обраному алгоритму
        return this.strategy(weight, distance)
    }
}

export { ShippingCalculator, upsStrategy, fedexStrategy, dhlStrategy }

// --- Застосування (main.js) ---

import {
    ShippingCalculator,
    upsStrategy,
    fedexStrategy,
    dhlStrategy,
} from './ShippingCalculator.js'

console.log('\n--- Патерн Стратегія ---')

const shipmentWeight = 10 // кг
const shipmentDistance = 500 // км

// Ініціалізуємо калькулятор з початковою стратегією UPS
const calculator = new ShippingCalculator(upsStrategy)

console.log(`Вартість UPS: $${calculator.calculate(shipmentWeight, shipmentDistance).toFixed(2)}`)

// Динамічно змінюємо стратегію під час виконання
calculator.setStrategy(fedexStrategy)
console.log(`Вартість FedEx: $${calculator.calculate(shipmentWeight, shipmentDistance).toFixed(2)}`)

// Знову змінюємо стратегію
calculator.setStrategy(dhlStrategy)
console.log(`Вартість DHL: $${calculator.calculate(shipmentWeight, shipmentDistance).toFixed(2)}`)
