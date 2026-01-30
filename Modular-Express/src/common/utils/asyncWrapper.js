/**
 * @file Обгортка для асинхронних Express-контролерів.
 * Дозволяє не писати try-catch у кожному методі.
 */

/**
 * Приймає асинхронну функцію і додає до неї автоматичний виклик .catch(next)
 * @param {Function} fn - Асинхронний контролер (req, res, next)
 * @returns {Function}
 */
const asyncHandler = (fn) => async (req, res, next) => {
    try {
        await fn(req, res, next)
    } catch (err) {
        next(err)
    }
}

export default asyncHandler
