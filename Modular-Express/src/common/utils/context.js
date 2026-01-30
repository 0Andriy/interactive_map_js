/**
 * @file Менеджер асинхронного контексту запиту.
 */
import { AsyncLocalStorage } from 'async_hooks'

/**
 * Екземпляр AsyncLocalStorage для зберігання метаданих запиту.
 * Дозволяє логеру отримувати доступ до requestId та userContext
 * у будь-якій точці виконання запиту (навіть у глибоких сервісах).
 */
export const asyncLocalStorage = new AsyncLocalStorage()

/**
 * Допоміжна функція для отримання поточного сховища.
 * @returns {object} Об'єкт контексту { requestId, correlationId, user, dbName }
 */
export const getContext = () => asyncLocalStorage.getStore() || {}

export default asyncLocalStorage
