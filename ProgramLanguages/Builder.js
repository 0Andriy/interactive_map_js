// Клас, який представляє складний об'єкт
class House {
    constructor() {
        this.hasWalls = false
        this.hasRoof = false
        this.hasGarage = false
        this.hasGarden = false
        this.hasSwimmingPool = false
    }

    describe() {
        console.log('House description:')
        console.log(`- Walls: ${this.hasWalls ? 'Yes' : 'No'}`)
        console.log(`- Roof: ${this.hasRoof ? 'Yes' : 'No'}`)
        console.log(`- Garage: ${this.hasGarage ? 'Yes' : 'No'}`)
        console.log(`- Garden: ${this.hasGarden ? 'Yes' : 'No'}`)
        console.log(`- Swimming Pool: ${this.hasSwimmingPool ? 'Yes' : 'No'}`)
    }
}

// Інтерфейс для будівельника (Builder)
class HouseBuilder {
    reset() {
        throw new Error("Method 'reset()' must be implemented.")
    }

    buildWalls() {
        throw new Error("Method 'buildWalls()' must be implemented.")
    }

    buildRoof() {
        throw new Error("Method 'buildRoof()' must be implemented.")
    }

    buildGarage() {
        throw new Error("Method 'buildGarage()' must be implemented.")
    }

    buildGarden() {
        throw new Error("Method 'buildGarden()' must be implemented.")
    }

    buildSwimmingPool() {
        throw new Error("Method 'buildSwimmingPool()' must be implemented.")
    }

    getResult() {
        throw new Error("Method 'getResult()' must be implemented.")
    }
}

// Конкретна реалізація будівельника
class ConcreteHouseBuilder extends HouseBuilder {
    constructor() {
        super()
        this.reset()
    }

    reset() {
        this.house = new House()
    }

    buildWalls() {
        this.house.hasWalls = true
    }

    buildRoof() {
        this.house.hasRoof = true
    }

    buildGarage() {
        this.house.hasGarage = true
    }

    buildGarden() {
        this.house.hasGarden = true
    }

    buildSwimmingPool() {
        this.house.hasSwimmingPool = true
    }

    getResult() {
        const result = this.house
        this.reset() // Починаємо будівництво нового об'єкта
        return result
    }
}

// Director — контролює порядок будівництва
class Director {
    setBuilder(builder) {
        this.builder = builder
    }

    // Будує простий будинок
    constructSimpleHouse() {
        this.builder.buildWalls()
        this.builder.buildRoof()
    }

    // Будує будинок з гаражем і садом
    constructFamilyHouse() {
        this.builder.buildWalls()
        this.builder.buildRoof()
        this.builder.buildGarage()
        this.builder.buildGarden()
    }

    // Будує люксовий будинок
    constructLuxuryHouse() {
        this.builder.buildWalls()
        this.builder.buildRoof()
        this.builder.buildGarage()
        this.builder.buildGarden()
        this.builder.buildSwimmingPool()
    }
}

// Тестування

const builder = new ConcreteHouseBuilder()
const director = new Director()
director.setBuilder(builder)

// Будуємо простий будинок
console.log('Simple House:')
director.constructSimpleHouse()
const simpleHouse = builder.getResult()
simpleHouse.describe()

// Будуємо сімейний будинок
console.log('\nFamily House:')
director.constructFamilyHouse()
const familyHouse = builder.getResult()
familyHouse.describe()

// Будуємо люксовий будинок
console.log('\nLuxury House:')
director.constructLuxuryHouse()
const luxuryHouse = builder.getResult()
luxuryHouse.describe()
