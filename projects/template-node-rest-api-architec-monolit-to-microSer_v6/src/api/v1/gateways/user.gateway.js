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

import userService from '../models/user.model.js'
import loggerModule from '../../../utils/logger.js'
const logger = loggerModule.getLoggerForService('user-management-service')

/**
 * Створює нового користувача.
 * @param {string} dbName - Назва бази даних, яка повинна відповідати одному з імен, визначених у файлі конфігурації
 * @param {object} userData - Дані користувача (username, email, password, etc.).
 * @returns {Promise<object>} Створений об'єкт користувача.
 */
export async function create(dbName, userData) {
    logger.debug(
        `[UserApiClient] Calling userService.create for user: ${
            userData.username || userData.email
        }`,
    )
    // У моноліті: прямий виклик методу репозиторію
    // userService відповідає за хешування пароля
    return userService.create(dbName, userData)
}

/**
 * Знаходить користувача за ідентифікатором.
 * @param {string} dbName - Назва бази даних, яка повинна відповідати одному з імен, визначених у файлі конфігурації
 * @param {string} userId - Ідентифікатор користувача.
 * @param {boolean} [includeDeleted=false] - Включати видалених користувачів.
 * @returns {Promise<object|null>} Об'єкт користувача або null.
 */
export async function findById(dbName, userId, includeDeleted = false) {
    logger.debug(`[UserApiClient] Calling userService.findById for userId: ${userId}`)
    // У моноліті: прямий виклик методу репозиторію
    return userService.findById(dbName, userId, includeDeleted)
}

/**
 * Знаходить користувача за ім'ям користувача (username).
 * @param {string} dbName - Назва бази даних, яка повинна відповідати одному з імен, визначених у файлі конфігурації
 * @param {string} username - Ім'я користувача.
 * @param {boolean} [includeDeleted=false] - Включати видалених користувачів.
 * @returns {Promise<object|null>} Об'єкт користувача або null.
 */
export async function findByUsername(dbName, username, includeDeleted = false) {
    logger.debug(`[UserApiClient] Calling userService.findByUsername for username: ${username}`)
    // У моноліті: прямий виклик методу репозиторію
    return userService.findByUsername(dbName, username, includeDeleted)
}

/**
 * Знаходить користувача за email.
 * @param {string} dbName - Назва бази даних, яка повинна відповідати одному з імен, визначених у файлі конфігурації
 * @param {string} email - Email користувача.
 * @param {boolean} [includeDeleted=false] - Включати видалених користувачів.
 * @returns {Promise<object|null>} Об'єкт користувача або null.
 */
export async function findByEmail(dbName, email, includeDeleted = false) {
    logger.debug(`[UserApiClient] Calling userService.findByEmail for email: ${email}`)
    // У моноліті: прямий виклик методу репозиторію
    return userService.findByEmail(dbName, email, includeDeleted)
}

/**
 * Оновлює дані користувача.
 * @param {string} dbName - Назва бази даних, яка повинна відповідати одному з імен, визначених у файлі конфігурації
 * @param {string} userId - Ідентифікатор користувача.
 * @param {object} updates - Об'єкт з полями для оновлення.
 * @returns {Promise<object>} Оновлений об'єкт користувача.
 */
export async function update(dbName, userId, updates) {
    logger.debug(`[UserApiClient] Calling userService.update for userId: ${userId}`)
    // У моноліті: прямий виклик методу репозиторію
    return userService.update(dbName, userId, updates)
}

/**
 * Перевіряє наданий пароль для вказаного користувача.
 * Цей метод використовується для валідації облікових даних.
 * @param {string} dbName - Назва бази даних, яка повинна відповідати одному з імен, визначених у файлі конфігурації
 * @param {string} userId - Ідентифікатор користувача.
 * @param {string} password - Пароль для перевірки.
 * @returns {Promise<boolean>} True, якщо пароль дійсний, інакше False.
 */
export async function verifyPassword(dbName, userId, password) {
    logger.debug(`[UserApiClient] Calling userService.verifyPassword for userId: ${userId}`)
    return userService.verifyPassword(dbName, userId, password)
}
