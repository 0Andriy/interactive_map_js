import { EventEmitter } from 'events'

/**
 * Клас CoffeeMachine імітує роботу кавомашини, використовуючи EventEmitter
 * для сповіщення про свій статус.
 */
class CoffeeMachine extends EventEmitter {
    constructor() {
        super()
        this.waterLevel = 10 // Початковий рівень води (порцій)
        console.log('[Machine] Кавомашина готова до роботи.')
    }

    /**
     * Запускає процес приготування кави.
     * @param {string} type - Тип кави (наприклад, 'latte', 'espresso').
     */
    makeCoffee(type) {
        if (this.waterLevel === 0) {
            // Випускаємо подію 'error', якщо немає води
            this.emit('error', new Error('Недостатньо води для приготування кави.'))
            return
        }

        console.log(`\n[Machine] Початок приготування ${type}...`)
        // Випускаємо подію 'start'
        this.emit('start', type)

        // Імітація часу приготування
        setTimeout(() => {
            this.waterLevel--
            console.log(
                `[Machine] Приготування ${type} завершено. Води залишилось: ${this.waterLevel}`,
            )
            // Випускаємо подію 'done'
            this.emit('done', { type: type, timestamp: Date.now() })

            if (this.waterLevel === 0) {
                // Випускаємо спеціальну подію, коли вода закінчилася
                this.emit('waterEmpty')
            }
        }, 1500) // Приготування займає 1.5 секунди
    }

    /**
     * Поповнює рівень води.
     */
    refillWater() {
        this.waterLevel = 10
        console.log('[Machine] Вода поповнена до максимального рівня.')
        this.emit('refilled') // Випускаємо подію 'refilled'
    }
}

export default CoffeeMachine
