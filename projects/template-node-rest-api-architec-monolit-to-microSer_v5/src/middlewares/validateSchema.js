/**
 * @file Middleware for validating incoming request data (body, query, params, headers) using Zod.
 * @module middlewares/validateInput
 */

import { z } from 'zod'

/**
 * @typedef {object} InputSchema
 * @property {z.ZodSchema<any>} [body] - Zod schema for the request body.
 * @property {z.ZodSchema<any>} [query] - Zod schema for the request query parameters.
 * @property {z.ZodSchema<any>} [params] - Zod schema for the request URL parameters.
 * @property {z.ZodSchema<any>} [headers] - Zod schema for the request headers.
 * @property {z.ZodSchema<any>} [cookies] - Zod schema for the request cookies.
 */

/**
 * Middleware to validate incoming request data (body, query, params, headers) against Zod schemas.
 * If validation is successful, the validated and transformed data is stored in `req.validatedData`.
 * If validation fails, it sends a 400 response with detailed validation errors.
 *
 * This middleware allows you to define a single set of schemas for different parts of the request
 * and validates them comprehensively, providing all validation errors at once.
 *
 * @param {InputSchema} schema - An object containing Zod schemas for the specific parts of the request to validate.
 * For example: `{ body: userSchema, query: searchSchema }`.
 * @returns {function(import('express').Request, import('express').Response, import('express').NextFunction): void}
 * An Express middleware function that handles the validation process.
 */
export const validateSchema = (schema) => {
    return async (req, res, next) => {
        try {
            /**
             * Object to collect the relevant parts of the request for validation.
             * @type {{ body?: any, query?: any, params?: any, headers?: any, cookies?: any }}
             */
            const dataToValidate = {}

            if (schema.body) {
                dataToValidate.body = req.body
            }
            if (schema.query) {
                dataToValidate.query = req.query
            }
            if (schema.params) {
                dataToValidate.params = req.params
            }
            if (schema.headers) {
                // Headers in Express are typically all lowercase, Zod schemas should reflect this.
                dataToValidate.headers = req.headers
            }
            if (schema.cookies) {
                dataToValidate.cookies = req.cookies
            }

            // Dynamically create a combined Zod object schema based on provided individual schemas.
            // If a schema for a part is not provided, it defaults to `z.any()` to allow it to pass.
            const combinedSchemaShape = {}
            if (schema.body) combinedSchemaShape.body = schema.body
            if (schema.query) combinedSchemaShape.query = schema.query
            if (schema.params) combinedSchemaShape.params = schema.params
            if (schema.headers) combinedSchemaShape.headers = schema.headers
            if (schema.cookies) combinedSchemaShape.cookies = schema.cookies

            // Ensure that if no specific schemas are provided, the combinedSchema still works.
            // This might happen if `schema` is an empty object `{}`.
            const combinedSchema = z.object(combinedSchemaShape)

            // Perform asynchronous validation using safeParseAsync to catch all errors.
            const result = await combinedSchema.safeParseAsync(dataToValidate)

            if (!result.success) {
                // If validation fails, format the Zod errors into a more readable array.
                const errors = result.error.errors.map((err) => ({
                    path: err.path.join('.'), // Join the path array (e.g., ['body', 'email']) into a string 'body.email'
                    message: err.message,
                    code: err.code,
                }))

                // Send a 400 Bad Request response with the validation errors.
                return res.status(400).json({
                    status: 'error',
                    message: 'Помилка валідації вхідних даних',
                    errors,
                })
            }

            /**
             * Store the validated and potentially transformed data in `req.validatedData`.
             * This makes the clean, validated data easily accessible in subsequent middleware
             * functions or route handlers.
             * @type {{ body?: any, query?: any, params?: any, headers?: any }}
             */
            req.validatedData = result.data

            // Proceed to the next middleware or route handler.
            next()
        } catch (error) {
            // If an unexpected error occurs during the middleware execution (not a ZodError),
            // pass it to Express's error handling middleware.
            next(error)
        }
    }
}
