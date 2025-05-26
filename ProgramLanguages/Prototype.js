// Абстрактний клас Shape
class Shape {
    constructor() {
        this.x = 0
        this.y = 0
        this.color = 'black'
    }

    // Метод для клонування
    clone() {
        throw new Error('Method "clone" must be implemented.')
    }

    // Метод для демонстрації властивостей
    describe() {
        console.log(`${this.constructor.name} at (${this.x}, ${this.y}) with color ${this.color}`)
    }
}

// Конкретна фігура: Коло
class Circle extends Shape {
    constructor() {
        super()
        this.radius = 0
    }

    clone() {
        const clone = new Circle()
        clone.x = this.x
        clone.y = this.y
        clone.color = this.color
        clone.radius = this.radius
        return clone
    }
}

// Конкретна фігура: Прямокутник
class Rectangle extends Shape {
    constructor() {
        super()
        this.width = 0
        this.height = 0
    }

    clone() {
        const clone = new Rectangle()
        clone.x = this.x
        clone.y = this.y
        clone.color = this.color
        clone.width = this.width
        clone.height = this.height
        return clone
    }
}

// Тестування Prototype

// Оригінальний круг
const circle1 = new Circle()
circle1.x = 10
circle1.y = 20
circle1.radius = 15
circle1.color = 'red'

console.log('Original Circle:')
circle1.describe()

// Клонований круг
const circle2 = circle1.clone()
circle2.x = 30 // змінюємо координати
console.log('Cloned Circle (with modified position):')
circle2.describe()

// Оригінальний прямокутник
const rect1 = new Rectangle()
rect1.x = 5
rect1.y = 5
rect1.width = 100
rect1.height = 50
rect1.color = 'blue'

console.log('\nOriginal Rectangle:')
rect1.describe()

// Клонований прямокутник
const rect2 = rect1.clone()
rect2.color = 'green' // змінюємо лише колір
console.log('Cloned Rectangle (with modified color):')
rect2.describe()
