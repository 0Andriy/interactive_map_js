// utils/operationBuilder.js

/**
 * Створює стандартизований об'єкт операції для виконання SQL-запиту.
 * @param {string} name - Унікальна назва операції (наприклад, назва таблиці, індексу, коментаря).
 * @param {string} sql - SQL-запит для виконання.
 * @param {string} type - Тип операції (наприклад, 'TABLE_CREATION', 'INDEX_CREATION', 'TABLE_COMMENT').
 * @param {object} [options={}] - Додаткові опції для операції.
 * @param {number} [options.existsErrorCode=null] - Код помилки СУБД, який вказує, що об'єкт вже існує (наприклад, 955 для Oracle).
 * @param {string} [options.successMessage='{type} {name} created successfully.'] - Повідомлення про успішне виконання.
 * @param {string} [options.existsMessage='{type} {name} already exists. Skipping creation.'] - Повідомлення, якщо об'єкт вже існує.
 * @param {string} [options.errorMessage='Error {type} {name}: {message}'] - Повідомлення про помилку.
 * @param {boolean} [options.critical=true] - Чи є помилка під час цієї операції критичною (зупиняє виконання).
 * @returns {object} Об'єкт операції.
 */
export function createOperation(name, sql, type, options = {}) {
    const defaultOptions = {
        existsErrorCode: null,
        successMessage: `{type} '{name}' created successfully.`,
        existsMessage: `{type} '{name}' already exists. Skipping creation.`,
        errorMessage: `Error {type} '{name}': {message}`,
        critical: true, // За замовчуванням критичні
    }

    const finalOptions = { ...defaultOptions, ...options }

    return {
        name,
        sql,
        type,
        existsErrorCode: finalOptions.existsErrorCode,
        // Замінюємо {type} у повідомленнях на верхній регістр
        successMessage: finalOptions.successMessage.replace('{type}', type.toUpperCase()),
        existsMessage: finalOptions.existsMessage.replace('{type}', type.toUpperCase()),
        errorMessage: finalOptions.errorMessage.replace('{type}', type.toUpperCase()),
        critical: finalOptions.critical,
    }
}
