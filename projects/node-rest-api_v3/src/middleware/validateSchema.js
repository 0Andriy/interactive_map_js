/**
 * @file Middleware for validating request data using Zod schemas.
 */

import { z } from 'zod'

/**
 * Middleware to validate incoming request data against a Zod schema.
 * If validation is successful, the validated and transformed data replaces the original data
 * in the specified request property. If validation fails, it sends a 400 response with detailed
 * validation errors.
 *
 * @param {z.ZodSchema<any>} schema - The Zod schema to validate against.
 * @param {'body' | 'query' | 'params'} property - The property of the request object to validate (e.g., 'body', 'query', 'params').
 * @returns {function(import('express').Request, import('express').Response, import('express').NextFunction): void} An Express middleware function.
 */
export const validateSchema = (schema, property) => (req, res, next) => {
    try {
        // Zod automatically transforms and validates data
        req[property] = schema.parse(req[property])
        next()
    } catch (error) {
        if (error instanceof z.ZodError) {
            const errors = error.errors.map((err) => ({
                path: err.path.join('.'),
                message: err.message,
                code: err.code,
            }))
            return res.status(400).json({
                message: 'Помилка валідації вхідних даних',
                errors: errors,
            })
        }
        next(error)
    }
}
