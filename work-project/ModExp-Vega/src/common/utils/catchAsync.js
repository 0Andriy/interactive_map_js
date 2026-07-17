/**
 * @file catchAsync.js
 * Універсальна обгортка для безпечного виконання асинхронних функцій.
 * Автоматично передає помилки в Express (через next) або прокидає їх далі.
 */

/**
 * Огортає асинхронну функцію для автоматичного перехоплення помилок.
 *
 * @param {Function} fn - Асинхронна функція, яку треба виконати.
 * @returns {AsyncFunction} - Обгорнута функція, що приймає будь-яку кількість аргументів.
 *
 * @example
 * // 1. В Express-контролері (автоматично знайде 'next'):
 * export const getUser = catchAsync(async (req, res, next) => {
 *   const user = await User.findById(req.params.id);
 *   res.json(user);
 * });
 *
 * @example
 * // 2. У сервісі або скрипті (прокине помилку далі):
 * const data = await catchAsync(myService)(param1, param2);
 */
export const catchAsync = (fn) => {
    return async (...args) => {
        try {
            // Викликаємо функцію з усіма переданими аргументами
            return await fn(...args)
        } catch (err) {
            // Шукаємо функцію 'next' серед аргументів (стандарт для Express)
            const next = args.find((arg) => typeof arg === 'function')

            if (next) {
                // Якщо це Express, передаємо помилку в глобальний обробник
                return next(err)
            }

            // Якщо 'next' немає, прокидаємо помилку для обробки вище по стеку
            throw err
        }
    }
}

export default catchAsync
