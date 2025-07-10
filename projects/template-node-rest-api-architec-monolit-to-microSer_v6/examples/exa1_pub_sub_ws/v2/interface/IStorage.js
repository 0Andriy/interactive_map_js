/**
 * @interface IStorage
 * @description Інтерфейс для сховища стану (наприклад, Redis, PostgreSQL, MongoDB).
 */
class IStorage {
    async get(key) {
        throw new Error("Method 'get()' must be implemented.")
    }
    async set(key, value, ttl = 0) {
        // ttl в секундах
        throw new Error("Method 'set()' must be implemented.")
    }
    async delete(key) {
        throw new Error("Method 'delete()' must be implemented.")
    }
    async listKeys(pattern) {
        // Для переліку кімнат/користувачів (можливо, не для всіх storage)
        throw new Error("Method 'listKeys()' must be implemented.")
    }
    // Методи для роботи з сетами (як для користувачів в кімнаті)
    async addToSet(key, member) {
        throw new Error("Method 'addToSet()' must be implemented.")
    }
    async removeFromSet(key, member) {
        throw new Error("Method 'removeFromSet()' must be implemented.")
    }
    async getSetMembers(key) {
        throw new Error("Method 'getSetMembers()' must be implemented.")
    }
    async getSetSize(key) {
        throw new Error("Method 'getSetSize()' must be implemented.")
    }

    async connect() {
        // Опціональний метод для підключення до сховища
    }
    async close() {
        // Опціональний метод для закриття з'єднання
    }
}

export { IStorage }
