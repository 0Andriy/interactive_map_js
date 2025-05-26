class Singleton {
    // Змінна для зберігання єдиного екземпляра
    static instance = null

    // Приватний конструктор для запобігання створенню екземплярів зовні
    constructor(settings = {}) {
        if (Singleton.instance) {
            // Якщо інстанція вже існує, повертаємо її
            return Singleton.instance
        }

        // Зберігаємо екземпляр класу
        Singleton.instance = this

        // Параметри налаштувань за замовчуванням
        this.settings = {
            featureEnabled: true,
            maxUsers: 100,
            ...settings, // Налаштування, що передаються при створенні інстанції
        }
    }

    // Статичний метод для отримання єдиного екземпляра Singleton
    static getInstance(settings = {}) {
        // Якщо інстанція ще не створена, створюємо нову
        if (!Singleton.instance) {
            Singleton.instance = new Singleton(settings)
        }
        // Повертаємо єдиний екземпляр
        return Singleton.instance
    }

    // Метод для отримання поточних налаштувань
    getSettings() {
        return this.settings
    }

    // Метод для оновлення налаштувань
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings }
    }

    // Метод для демонстрації роботи
    displaySettings() {
        console.log('Current Settings:', this.settings)
    }
}

const sInstance = Singleton.getInstance()
export default sInstance
export { Singleton }

// // Тестування Singleton через getInstance
// const instance1 = Singleton.getInstance({ featureEnabled: false, maxUsers: 50 })
// instance1.displaySettings() // { featureEnabled: false, maxUsers: 50 }

// const instance2 = Singleton.getInstance({ featureEnabled: true, maxUsers: 200 })
// instance2.displaySettings() // { featureEnabled: false, maxUsers: 50 }

// console.log(instance1 === instance2) // true, оскільки це один і той самий екземпляр

// // Оновлення налаштувань через існуючу інстанцію
// instance1.updateSettings({ maxUsers: 150 })
// instance1.displaySettings() // { featureEnabled: false, maxUsers: 150 }
