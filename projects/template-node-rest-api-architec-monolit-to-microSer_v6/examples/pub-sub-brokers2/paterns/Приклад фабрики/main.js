// main.js
import factory from './GenericFactory.js'

// --- Визначення класів для різних тематик ---

class Car {
    constructor(config) {
        console.log(`🚗 Створено Car. Колір: ${config.color}`)
    }
    start() {
        console.log('Врум')
    }
}

class Motorcycle {
    constructor(config) {
        console.log(`🏍️ Створено Motorcycle. CC: ${config.cc}`)
    }
    start() {
        console.log('Рев')
    }
}

class UserProfile {
    constructor(config) {
        console.log(`👤 Створено UserProfile для ID: ${config.userId}`)
    }
    loadData() {
        console.log('Завантаження даних користувача...')
    }
}

// --- Реєстрація класів у фабриці ---

factory.register('auto', Car)
factory.register('moto', Motorcycle)
factory.register('userProfile', UserProfile)

// --- Створення об'єктів за допомогою універсальної фабрики ---

console.log("\n--- Створення об'єктів через універсальну фабрику ---")

const vehicle1 = factory.create('auto', { color: 'синій' })
vehicle1.start()

const vehicle2 = factory.create('moto', { cc: 600 })
vehicle2.start()

const profile = factory.create('userProfile', { userId: 12345 })
profile.loadData()

console.log('\n--- Спроба створити неіснуючий тип ---')
try {
    factory.create('boat')
} catch (error) {
    console.error(error.message)
}
