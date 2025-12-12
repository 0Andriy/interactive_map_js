// LoggerSystem/index.js
import { LogManager } from './LogManager.js'

// Створюємо єдиний екземпляр класу LogManager (Singleton)
const LoggerInstance = new LogManager()

// Експортуємо цей єдиний екземпляр за замовчуванням
export default LoggerInstance
