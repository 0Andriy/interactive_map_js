// Абстрактні класи для меблів

// Інтерфейс для стільців
class Chair {
    sitOn() {
        throw new Error("Method 'sitOn' must be implemented.")
    }
}

// Інтерфейс для столів
class Table {
    placeItem() {
        throw new Error("Method 'placeItem' must be implemented.")
    }
}

// Конкретні реалізації стільців і столів

// Клас "Класичний стілець"
class ClassicChair extends Chair {
    sitOn() {
        console.log('You sit on a classic chair.')
    }
}

// Клас "Класичний стіл"
class ClassicTable extends Table {
    placeItem() {
        console.log('You place an item on a classic table.')
    }
}

// Клас "Сучасний стілець"
class ModernChair extends Chair {
    sitOn() {
        console.log('You sit on a modern chair.')
    }
}

// Клас "Сучасний стіл"
class ModernTable extends Table {
    placeItem() {
        console.log('You place an item on a modern table.')
    }
}

// Абстрактна фабрика для меблів
class FurnitureFactory {
    createChair() {
        throw new Error("Method 'createChair' must be implemented.")
    }

    createTable() {
        throw new Error("Method 'createTable' must be implemented.")
    }
}

// Конкретні фабрики для створення меблів

// Клас "Класична фабрика"
class ClassicFurnitureFactory extends FurnitureFactory {
    createChair() {
        return new ClassicChair()
    }

    createTable() {
        return new ClassicTable()
    }
}

// Клас "Сучасна фабрика"
class ModernFurnitureFactory extends FurnitureFactory {
    createChair() {
        return new ModernChair()
    }

    createTable() {
        return new ModernTable()
    }
}

// Функція для тестування створених меблів
function testFurniture(factory) {
    const chair = factory.createChair()
    const table = factory.createTable()

    chair.sitOn() // Викликаємо метод для стільця
    table.placeItem() // Викликаємо метод для столу
}

// Створення класичної фабрики і тестування
const classicFactory = new ClassicFurnitureFactory()
console.log('Classic Furniture:')
testFurniture(classicFactory)

// Створення сучасної фабрики і тестування
const modernFactory = new ModernFurnitureFactory()
console.log('Modern Furniture:')
testFurniture(modernFactory)
