// utils/logSource.js

/**
 * Парсить стек викликів, щоб знайти інформацію про файл та рядок.
 * @param {number} stackIndex - Індекс у стеку викликів, який вказує на реальне джерело логування.
 * Зазвичай 0 - це getSource, 1 - виклик логера, 2 - ваш код.
 * @returns {object} Об'єкт з `file` та `line` або null.
 */
function getSource(stackIndex = 2) {
    try {
        // Створюємо помилку, щоб отримати стек викликів
        const error = new Error()
        // Розділяємо стек на рядки
        const stackLines = error.stack.split('\n')

        // Знаходимо рядок, який відповідає реальному виклику логера
        // Зазвичай перший рядок - це "Error", другий - getSource, третій - виклик winston,
        // четвертий - вже ваш код. Тому stackIndex = 3 (або більше, якщо у вас обгортки)
        // У нашому випадку, якщо ми викликаємо з logger.info('msg'), то 2 буде коректним.
        const line = stackLines[stackIndex]

        // Приклад формату рядка стека:
        // "    at <anonymous> (/path/to/your/project/src/controllers/authController.js:15:13)"
        // або
        // "    at authUser (/path/to/your/project/src/services/userService.js:42:5)"

        // Регулярний вираз для вилучення шляху до файлу та номера рядка
        const match = line.match(/\((.*):(\d+):(\d+)\)$/)
        if (match && match[1] && match[2]) {
            // Отримуємо відносний шлях до файлу
            const filePath = match[1]
            const projectRoot = process.cwd() // Корінь вашого проекту
            const relativePath = filePath.startsWith(projectRoot)
                ? filePath.substring(projectRoot.length + 1) // +1 для слеша
                : filePath

            return {
                file: relativePath,
                line: parseInt(match[2], 10),
            }
        }
    } catch (e) {
        // Можна залогувати помилку, якщо щось пішло не так при отриманні джерела
        // console.error('Помилка отримання джерела логування:', e);
    }
    return null
}

export default getSource

// <================================================================>

// utils/logger.js
import winston from 'winston'
import getSource from './logSource.js' // Імпортуємо нашу функцію

const { combine, timestamp, printf, colorize, errors } = winston.format

// Кастомний формат, який додає source_file та line_number
const customFormat = printf(({ level, message, timestamp, service, stack, ...metadata }) => {
    let logMessage = `${timestamp} [${level.toUpperCase()}]`

    // Додаємо ім'я сервісу, якщо воно є
    if (service) {
        logMessage += ` [${service}]`
    }

    // Додаємо інформацію про файл та рядок, якщо вона є
    const source = getSource(4) // Змінюємо stackIndex на 4, враховуючи наш обгортку `getLoggerForService`
    if (source) {
        logMessage += ` [${source.file}:${source.line}]`
    }

    logMessage += `: ${message}`

    // Додаємо стек для помилок
    if (stack) {
        logMessage += `\n${stack}`
    }

    // Додаємо інші метадані, якщо вони є
    if (Object.keys(metadata).length > 0) {
        // Видаляємо деякі внутрішні метадані Winston, якщо вони не потрібні в логах
        delete metadata.error
        delete metadata[Symbol.for('level')]
        delete metadata[Symbol.for('splat')]
        delete metadata[Symbol.for('message')]
        if (Object.keys(metadata).length > 0) {
            logMessage += ` ${JSON.stringify(metadata)}`
        }
    }

    return logMessage
})

// Налаштування логера за замовчуванням (можна вимкнути для продукції)
const defaultLogger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: combine(
        errors({ stack: true }), // Важливо для логування стека помилок
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        colorize(), // Для кольорового виводу в консоль
        customFormat, // Використовуємо наш кастомний формат
    ),
    transports: [new winston.transports.Console()],
})

// Мапа для зберігання логерів за сервісами
const serviceLoggers = new Map()

// Функція для отримання логера для конкретного сервісу
const getLoggerForService = (serviceName) => {
    if (!serviceLoggers.has(serviceName)) {
        const serviceLogger = winston.createLogger({
            level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
            format: combine(
                errors({ stack: true }), // Додаємо стек помилок
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                // Для JSON-логування в файл або централізовану систему
                winston.format.json({
                    // Додаємо функцію transform, щоб вставити service, file та line
                    // Це відбувається до того, як JSON-форматер серіалізує об'єкт
                    transform: (info, opts) => {
                        info.service = serviceName // Додаємо serviceName

                        // Отримуємо джерело і додаємо його, якщо воно є
                        // Важливо: StackIndex тут буде 3, тому що:
                        // 0 - Error, 1 - getSource, 2 - winston.format.json, 3 - ваш виклик логера з файлу
                        const source = getSource(3) // Зверніть увагу на stackIndex тут!
                        if (source) {
                            info.source_file = source.file
                            info.line_number = source.line
                        }
                        return info
                    },
                }),
            ),
            transports: [
                new winston.transports.Console(), // Виводимо JSON в консоль
                // Приклад: логування в файл (для продукції)
                // new winston.transports.File({ filename: `logs/${serviceName}-error.log`, level: 'error' }),
                // new winston.transports.File({ filename: `logs/${serviceName}-combined.log` })
            ],
        })
        serviceLoggers.set(serviceName, serviceLogger)
    }
    return serviceLoggers.get(serviceName)
}

// export default {
//   default: defaultLogger, // Експортуємо логер за замовчуванням
//   getLoggerForService // Експортуємо функцію для отримання логерів за сервісом
// };
