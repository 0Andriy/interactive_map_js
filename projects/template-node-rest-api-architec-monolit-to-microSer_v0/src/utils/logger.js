// src/utils/logger/logger.js

/**
 * @fileoverview Єдиний екземпляр логера (Singleton) для використання в усьому додатку.
 * Це забезпечує наявність одного централізованого об'єкта логування.
 */

import config from '../config/config.js'
import LoggerFactory from './logger/LoggerFactory.js'
import { asyncLocalStorage } from './logger/WinstonLogger.js' // AsyncLocalStorage залишається з WinstonLogger
// Важливо: Якщо ви використовуєте Winston transports, які потрібно ініціалізувати (наприклад, FileTransport),
// вам може знадобитися імпортувати їх тут і додати до масиву 'transports' в конфігурації,
// або ж залишити ініціалізацію транспортов всередині конструктора WinstonLogger.
// Приклад:
// import winston from 'winston';
// config.logger.winston.transports.push(new winston.transports.File({ filename: 'app.log' }));

/**
 * Єдиний екземпляр логера, створений за допомогою LoggerFactory на основі конфігурації.
 * Цей об'єкт буде імпортуватися в усі модулі, яким потрібен логер.
 * @type {ILogger}
 */
const logger = LoggerFactory.createLogger(config.logger.type, config.logger)

export default logger
export { asyncLocalStorage }
