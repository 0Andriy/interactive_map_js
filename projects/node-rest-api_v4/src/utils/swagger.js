import swaggerJsdoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'

import path from 'path'
import { fileURLToPath } from 'url'

/**
 * Отримує поточну назву файлу.
 * @type {string}
 */
const __filename = fileURLToPath(import.meta.url)
/**
 * Отримує поточну назву директорії.
 * @type {string}
 */
const __dirname = path.dirname(__filename)

/**
 * Об'єкт конфігурації для swagger-jsdoc.
 * Визначає основну інформацію про API, компоненти безпеки та шляхи до файлів, що містять JSDoc для генерації OpenAPI специфікації.
 * @type {import('swagger-jsdoc').Options}
 */
const swaggerOptions = {
    // Swagger definition
    // You can set every attribute except paths and swagger
    // https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md

    /**
     * Основна інформація про API (обов'язкове поле).
     * @type {import('swagger-jsdoc').SwaggerDefinition}
     */
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'REST API',
            description: 'Example of CRUD API',
            version: '1.0.0',
        },
        servers: [],
        /**
         * Компоненти безпеки API, наприклад, для JWT авторизації.
         * @type {object}
         */
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'Bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        tags: [],
    },

    /**
     * Шлях(и) до файлів, де описані роутери та API-документація у форматі JSDoc.
     * Ці файли будуть прочитані і з них згенеруються paths для OpenAPI.
     * @type {string[]}
     */
    apis: [path.join(__dirname, '../**/**.js')], // Можна зробити більш конкретним, наприклад, '../routes/**/*.js'
}

/**
 * Сгенерована специфікація Swagger на основі `swaggerOptions`.
 * @type {object}
 */
const swaggerSpec = swaggerJsdoc(swaggerOptions)

/**
 * Допоміжна функція для динамічного додавання серверу до специфікації Swagger.
 * Це дозволяє Swagger UI автоматично визначати базовий URL API на основі поточного запиту.
 * @param {object} spec - Об'єкт специфікації Swagger.
 * @param {import('express').Request} req - Об'єкт запиту Express.
 * @returns {object} Оновлений об'єкт специфікації Swagger з динамічно доданим сервером.
 */
const withDynamicServer = (spec, req) => {
    const protocol = req.protocol
    const host = req.get('host')

    return {
        ...spec,
        // servers: [
        //     {
        //         url: `${protocol}://${host}`,
        //         description: 'Auto-detected server',
        //     },
        // ],
    }
}

/**
 * Налаштовує Swagger UI та JSON-ендпоїнти для документації API.
 * @param {import('express').Application} app - Екземпляр Express додатка.
 * @param {number} [port=3000] - Порт, на якому працює сервер. Використовується для логування.
 * @param {string} [host='localhost'] - Хост, на якому працює сервер. Використовується для логування.
 * @param {string} [protocol='http'] - Протокол (http/https). Використовується для логування.
 * @param {object} [logger] - Об'єкт логера з методами debug, info, warn, error.
 * @param {function(...any): void} [logger.debug=console.debug] - Метод для дебаг-повідомлень.
 * @param {function(...any): void} [logger.info=console.log] - Метод для інформаційних повідомлень.
 * @param {function(...any): void} [logger.warn=console.log] - Метод для попереджень.
 * @param {function(...any): void} [logger.error=console.error] - Метод для помилок.
 * @returns {void}
 */
function swaggerDocs(
    app,
    port = 3000,
    host = 'localhost',
    protocol = 'http',
    logger = {
        debug: (...args) => console.debug('[DEBUG]', ...args),
        info: (...args) => console.log('[INFO]', ...args),
        warn: (...args) => console.log('[WARN]', ...args),
        error: (...args) => console.error('[ERROR]', ...args),
    },
) {
    const endpoint = 'api-docs'

    // Додаємо інформацію про сервер до специфікації Swagger
    // Це дозволить Swagger UI показувати коректні базові URL для запитів
    swaggerSpec.servers.push({
        url: `${protocol}://${host}:${port}`,
        description: `${protocol.toUpperCase()} Server`,
    })

    // Swagger UI ендпоїнт
    app.use(`/${endpoint}`, swaggerUi.serve, (req, res, next) =>
        swaggerUi.setup(withDynamicServer(swaggerSpec, req))(req, res, next),
    )

    // JSON версія документації
    app.get(`/${endpoint}.json`, (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.send(withDynamicServer(swaggerSpec, req))
    })

    logger.info(`✅ Swagger доступний за адресою: ${protocol}://${host}:${port}/${endpoint}`)
}

export default swaggerDocs

export { swaggerSpec, swaggerUi }
