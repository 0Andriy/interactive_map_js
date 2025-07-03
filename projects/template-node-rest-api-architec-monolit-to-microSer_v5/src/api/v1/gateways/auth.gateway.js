// src/api/v1/gateways/user.gateway.js

/**
 * @fileoverview Клієнт для взаємодії з модулем User.
 * У поточному монолітному налаштуванні він напряму викликає User Repository.
 * У майбутньому, при переході на мікросервіси, цей клієнт буде виконувати HTTP-запити до User Service.
 * Це буде імітувати виклик до мікросервісу User.
 * У моноліті ми імпортуємо його напряму.
 * У мікросервісах це буде HTTP-виклики до User Microservice.
 * /**
 * Клієнт для взаємодії з User Microservice через HTTP.
 * Відповідає за виконання HTTP-запитів до User Service.
 *
 *  export const createUser = async (userData) => {
 *      // У моноліті: прямий виклик методу репозиторію
 *      return userService.create(dbName, userData)
 *
 *      // For Microservice
 *      logger.debug(`Calling User Service: POST ${USER_SERVICE_BASE_URL}/users`);
 *      try {
 *          const response = await axios.post(`${USER_SERVICE_BASE_URL}/users`, userData);
 *          return response.data; // Повертаємо дані користувача, отримані від User Service
 *      } catch (error) {
 *          logger.error(`Error creating user via User Service: ${error.message}`, {
 *              status: error.response?.status,
 *              data: error.response?.data
 *          });
 *          // Прокидаємо помилку далі, можливо, з більш зрозумілим повідомленням
 *          throw new Error(error.response?.data?.message || 'Failed to create user in User Service.');
 *      }
 *  };
 */

import authService from '../services/auth.service.js'
import loggerModule from '../../../utils/logger.js'
const logger = loggerModule.getLoggerForService('auth-service')

/**
 * Створює нового користувача.
 * @param {string} dbName - Назва бази даних, яка повинна відповідати одному з імен, визначених у файлі конфігурації
 * @param {object} userId - id користувача
 * @returns {Promise<number>} - кількіть відкликаних токенів
 */
export async function revokeAllUserTokens(dbName, userId) {
    logger.debug(`[AuthApiClient] Calling authService.revokeAllUserTokens for user: ${userId}`)
    // У моноліті: прямий виклик методу репозиторію
    return authService.revokeAllUserTokens(dbName, userId)
}
