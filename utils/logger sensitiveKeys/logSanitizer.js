// utils/logSanitizer.js
import { EXACT_SENSITIVE_KEYS, SENSITIVE_KEY_PATTERNS } from '../constants/sensitiveKeys.js'

const REDACTION_PLACEHOLDER = '[REDACTED]'
const PARTIAL_REDACTION_LENGTH = 4

/**
 * Перевіряє, чи є ключ чутливим, використовуючи точні відповідності та регулярні вирази.
 * @param {string} key - Ключ для перевірки.
 * @param {string[]} exactKeys - Масив точних чутливих ключів.
 * @param {RegExp[]} patterns - Масив регулярних виразів для чутливих ключів.
 * @returns {boolean} True, якщо ключ чутливий.
 */
function isSensitiveKey(key, exactKeys, patterns) {
    // 1. Перевірка на точну відповідність
    if (exactKeys.includes(key)) {
        return true
    }

    // 2. Перевірка на відповідність регулярним виразам
    for (const pattern of patterns) {
        if (pattern.test(key)) {
            return true
        }
    }
    return false
}

/**
 * Рекурсивно санітаризує об'єкт, замінюючи значення чутливих ключів.
 * @param {any} data - Дані для санітаризації (об'єкт, масив, примітив).
 * @param {string[]} exactKeysToRedact - Масив точних чутливих ключів.
 * @param {RegExp[]} keyPatternsToRedact - Масив регулярних виразів для чутливих ключів.
 * @returns {any} Санітаризовані дані.
 */
function sanitizeLogData(
    data,
    exactKeysToRedact = EXACT_SENSITIVE_KEYS,
    keyPatternsToRedact = SENSITIVE_KEY_PATTERNS,
) {
    // Якщо дані відсутні або є примітивом, повертаємо їх без змін
    if (data === null || typeof data === 'undefined' || typeof data !== 'object') {
        return data
    }

    // Якщо це масив, рекурсивно санітаризуємо кожен елемент
    if (Array.isArray(data)) {
        return data.map((item) => sanitizeLogData(item, exactKeysToRedact, keyPatternsToRedact))
    }

    // Якщо це об'єкт, створюємо санітаризовану копію
    const sanitizedObject = {}
    for (const key in data) {
        // Перевіряємо, чи властивість належить самому об'єкту
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            const value = data[key]

            // Якщо ключ є чутливим згідно з шаблонами
            if (isSensitiveKey(key, exactKeysToRedact, keyPatternsToRedact)) {
                // Логіка маскування для чутливих полів
                if (typeof value === 'string' && value.length > PARTIAL_REDACTION_LENGTH) {
                    sanitizedObject[key] = '****' + value.slice(-PARTIAL_REDACTION_LENGTH)
                } else {
                    sanitizedObject[key] = REDACTION_PLACEHOLDER
                }
            } else if (typeof value === 'object' && value !== null) {
                // Якщо значення є об'єктом або масивом, рекурсивно санітаризуємо його
                sanitizedObject[key] = sanitizeLogData(
                    value,
                    exactKeysToRedact,
                    keyPatternsToRedact,
                )
            } else {
                // В іншому випадку, копіюємо значення як є
                sanitizedObject[key] = value
            }
        }
    }
    return sanitizedObject
}

export default sanitizeLogData
