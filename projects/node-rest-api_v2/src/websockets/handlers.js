// src/websockets/handlers.js
import logger from '../utils/logger.js'
//
import oracleDbManager from '../db/OracleDbManager2.js'

const dbService = {
    /**
     * Метод для загальних даних кімнати (використовується за замовчуванням для динамічних кімнат)
     * @param {string} roomName - Назва кімнати.
     * @param {object} params - Об'єкт параметрів.
     * @returns {Promise<Object[]>} Масив об'єктів даних для кімнати.
     */
    getRoomData: async (roomName, params = {}) => {
        logger.debug(`[DbService] Запит getRoomData для '${roomName}' з параметрами:`, params)
        // Імітуємо затримку запиту до БД
        await new Promise((resolve) => setTimeout(resolve, 500))
        return {
            message: `Дані для кімнати '${roomName}'`,
            timestamp: new Date().toISOString(),
            dynamicParam: params.param || 'N/A',
        }
    },
    /**
     * Метод для кімнати новин (припустимо, що є predefined кімната 'global-news')
     * @param {string} roomName - Назва кімнати.
     * @param {object} params - Об'єкт параметрів.
     * @returns {Promise<Object[]>} Масив об'єктів даних для кімнати.
     */
    getNewsFeedData: async (roomName) => {
        console.log(`[DbService] Запит getNewsFeedData для '${roomName}'`)
        await new Promise((resolve) => setTimeout(resolve, 800))
        return [
            { id: 1, title: 'Breaking News: AI continues to advance!', category: 'AI' },
            { id: 2, title: 'Local Event: Tech Meetup next week', category: 'Community' },
        ]
    },
    /**
     * Метод для отримання статусу замовлення за ID (для динамічної кімнати 'order-status-XYZ')
     * @param {string} roomName - Назва кімнати.
     * @param {object} params - Об'єкт параметрів.
     * @returns {Promise<Object[]>} Масив об'єктів даних для кімнати.
     */
    getOrderByOrderId: async (orderId) => {
        console.log(`[DbService] Запит getOrderByOrderId для ID: ${orderId}`)
        await new Promise((resolve) => setTimeout(resolve, 300))
        const statuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled']
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)]
        return { orderId, status: randomStatus, lastUpdate: new Date().toISOString() }
    },
}

export default dbService
