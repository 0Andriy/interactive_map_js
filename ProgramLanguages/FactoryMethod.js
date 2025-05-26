// 1. Базовий клас для всіх типів транспорту
class Transport {
    constructor(name, maxSpeed) {
        this.name = name // Назва транспорту
        this.maxSpeed = maxSpeed // Максимальна швидкість
    }

    // Абстрактний метод для демонстрації руху транспорту (повинен бути реалізований у підкласах)
    drive() {
        throw new Error('Метод "drive" має бути реалізований в підкласах')
    }

    // Метод для показу інфо про транспорт
    info() {
        console.log(`${this.name} має максимальну швидкість ${this.maxSpeed} км/год.`)
    }
}

// 2. Підклас для автомобіля
class Car extends Transport {
    constructor(model, maxSpeed, fuelType) {
        super(model, maxSpeed) // Викликаємо конструктор базового класу
        this.fuelType = fuelType // Тип пального (бензин/дизель/електричний)
    }

    // Реалізація методу drive
    drive() {
        console.log(
            `Driving a car with model ${this.name} at max speed ${this.maxSpeed} km/h using ${this.fuelType} fuel.`,
        )
    }

    // Метод для демонстрації пального
    fuelInfo() {
        console.log(`The car runs on ${this.fuelType}.`)
    }
}

// 3. Підклас для велосипеда
class Bicycle extends Transport {
    constructor(model, maxSpeed) {
        super(model, maxSpeed) // Викликаємо конструктор базового класу
    }

    // Реалізація методу drive
    drive() {
        console.log(`Riding a bicycle ${this.name} at max speed ${this.maxSpeed} km/h.`)
    }

    // Додатковий метод для велосипеда
    pedal() {
        console.log('Pedaling the bicycle...')
    }
}

// 4. Підклас для мотоцикла
class Motorcycle extends Transport {
    constructor(model, maxSpeed, engineType) {
        super(model, maxSpeed) // Викликаємо конструктор базового класу
        this.engineType = engineType // Тип двигуна (двотактний/четвертактний)
    }

    // Реалізація методу drive
    drive() {
        console.log(
            `Riding a motorcycle ${this.name} at max speed ${this.maxSpeed} km/h with a ${this.engineType} engine.`,
        )
    }

    // Метод для інформації про двигун
    engineInfo() {
        console.log(`The motorcycle has a ${this.engineType} engine.`)
    }
}

// 5. Фабричний клас, який створює різні типи транспорту
class TransportFactory {
    // Фабричний метод для створення транспорту
    static createTransport(type, model, maxSpeed, extraFeature) {
        switch (type) {
            case 'car':
                return new Car(model, maxSpeed, extraFeature) // Тип пального
            case 'bicycle':
                return new Bicycle(model, maxSpeed) // Відсутність додаткових параметрів
            case 'motorcycle':
                return new Motorcycle(model, maxSpeed, extraFeature) // Тип двигуна
            default:
                throw new Error('Unknown transport type')
        }
    }
}

// 6. Тестування

// Створення автомобіля з фабричним методом
const car = TransportFactory.createTransport('car', 'Toyota Corolla', 180, 'gasoline')
car.info() // Виводить інфо про авто
car.drive() // Виводить повідомлення про рух автомобіля
car.fuelInfo() // Виводить інфо про тип пального

// Створення велосипеда з фабричним методом
const bicycle = TransportFactory.createTransport('bicycle', 'Mountain Bike', 50)
bicycle.info() // Виводить інфо про велосипед
bicycle.drive() // Виводить повідомлення про рух велосипеда
bicycle.pedal() // Виводить повідомлення про педалювання

// Створення мотоцикла з фабричним методом
const motorcycle = TransportFactory.createTransport(
    'motorcycle',
    'Harley Davidson',
    220,
    'four-stroke',
)
motorcycle.info() // Виводить інфо про мотоцикл
motorcycle.drive() // Виводить повідомлення про рух мотоцикла
motorcycle.engineInfo() // Виводить інфо про тип двигуна
