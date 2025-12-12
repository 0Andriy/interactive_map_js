// DatabaseConnection.js (Singleton)

/**
 * Клас DatabaseConnection реалізує патерн Одинак.
 * Він керує єдиним підключенням до бази даних для всього застосунку.
 */
class DatabaseConnection {
    constructor(connectionString) {
        if (DatabaseConnection.instance) {
            // Якщо екземпляр вже існує, повертаємо його
            return DatabaseConnection.instance
        }

        // Ініціалізація нового підключення (виконується тільки один раз)
        this.connectionString = connectionString
        this.isConnected = false
        console.log('[Singleton] Ініціалізація нового підключення до БД...')

        // Зберігаємо поточний екземпляр як єдиний
        DatabaseConnection.instance = this
    }

    connect() {
        if (!this.isConnected) {
            // Логіка підключення до реальної БД
            this.isConnected = true
            console.log('[Singleton] Підключено до БД.')
        } else {
            console.log('[Singleton] Вже підключено.')
        }
    }

    query(sql) {
        if (this.isConnected) {
            console.log(`[Singleton] Виконую запит: ${sql}`)
            // ... логіка виконання запиту ...
        } else {
            console.error('[Singleton] Помилка: Не підключено до БД.')
        }
    }
}

// Експортуємо єдиний екземпляр класу (найпоширеніший спосіб у Node.js)
// Клієнти просто імпортують цей об'єкт і використовують його
const dbInstance = new DatabaseConnection('mongodb://localhost:27017/myApp')
export default dbInstance

// --- Застосування (main.js) ---

// У різних частинах застосунку ви просто імпортуєте dbInstance
import DB from './DatabaseConnection.js'
import DB_Service from './DatabaseConnection.js'

console.log('--- Патерн Одинак ---')

DB.connect() // Ініціалізує підключення
DB.query('SELECT * FROM users') // Використовує підключення

// Навіть якщо ми імпортуємо під іншим ім'ям (DB_Service), це той самий об'єкт
DB_Service.query('INSERT INTO logs (...)')

// Перевірка, що це справді один і той самий об'єкт у пам'яті
console.log(`Обидва імпорти посилаються на один об'єкт? ${DB === DB_Service}`) // Виведе: true
