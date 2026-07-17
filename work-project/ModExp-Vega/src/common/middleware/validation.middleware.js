/**
 * @file Універсальний middleware для валідації даних за допомогою Zod.
 */

import CustomError from '../utils/CustomError.js'

/**
 * Middleware для валідації вхідних даних запиту.
 *
 * @param {import('zod').ZodSchema} schema - Zod схема для перевірки.
 * @param {'body' | 'query' | 'params'} [target='body'] - Частина запиту, яку треба валідувати.
 * @returns {import('express').RequestHandler}
 */
export const validate =
    (schema, target = 'body') =>
    (req, res, next) => {
        try {
            // safeParse повертає об'єкт з результатом, не викидаючи виключення
            const result = schema.safeParse(req[target])

            if (!result.success) {
                // Формуємо масив помилок у зручному для клієнта форматі
                const errorDetails = result.error.errors.map((err) => ({
                    path: err.path.join('.'), // Перетворює ['address', 'city'] -> "address.city"
                    message: err.message,
                }))

                // Використовуємо наш фабричний метод для 422 Unprocessable Entity
                // Передаємо деталі у масив errors нашого CustomError
                return next(
                    CustomError.Validation(
                        'Помилка валідації вхідних даних',
                        { target },
                        errorDetails,
                    ),
                )
            }

            /**
             * ВАЖЛИВО: Zod після парсингу повертає очищені дані (stripped data).
             * Якщо в схемі не описані зайві поля, вони будуть видалені.
             * Це захищає від Mass Assignment атак.
             */
            req[target] = result.data

            next()
        } catch (error) {
            // На випадок непередбачуваних помилок у самому Zod
            next(error)
        }
    }

export default validate
