// src/routes/v1/auth/schemas/auth.schemas.js
import { z } from 'zod'

// JWT регулярний вираз (для базової перевірки JWT формату)
const jwtPattern = /^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]*$/
// Bearer токен формат: "Bearer <token>"
const bearerTokenRegex = /^Bearer\s[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]*$/

/**
 * Register (signup) body schema
 * Схема для валідації даних реєстрації
 */
export const registerBodySchema = z.object({
    username: z
        .string()
        .min(3, { message: 'Username must be at least 3 characters long.' })
        .max(50, { message: 'Username cannot exceed 50 characters.' })
        .trim(),
    email: z
        .string()
        .email({ message: 'Invalid email address.' })
        .max(100, { message: 'Email cannot exceed 100 characters.' })
        .trim()
        .toLowerCase(),
    password: z
        .string()
        .min(1, { message: 'Password must be at least 8 characters long.' })
        .max(128, { message: 'Password cannot exceed 128 characters.' }),
    /*.regex(/[a-z]/, { message: 'Password must contain at least one lowercase letter.' })
        .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter.' })
        .regex(/[0-9]/, { message: 'Password must contain at least one number.' })
        .regex(/[^a-zA-Z0-9]/, {
            message: 'Password must contain at least one special character.',
        })*/
    firstName: z
        .string()
        .min(1, { message: 'First name is required.' })
        .max(50, { message: 'First name cannot exceed 50 characters.' })
        .trim()
        .optional(), // Може бути необов'язковим
    lastName: z
        .string()
        .min(1, { message: 'Last name is required.' })
        .max(50, { message: 'Last name cannot exceed 50 characters.' })
        .trim()
        .optional(), // Може бути необов'язковим
})

/**
 * Login body schema
 * Схема для валідації даних входу
 */
export const loginBodySchema = z.object({
    username: z
        .string()
        .min(1, { message: 'Username/email is required' })
        .max(50, { message: 'Username cannot exceed 50 characters.' })
        .trim(),
    password: z
        .string()
        .min(1, { message: 'Password is required.' })
        .max(128, { message: 'Password cannot exceed 128 characters.' }),
})

/**
 * Logout body schema (refreshToken required)
 */
export const logoutBodySchema = z.object({
    refreshToken: z.string().regex(jwtPattern, 'Invalid JWT refresh token format'),
})

export const authorizationHeaderSchema = z.object({
    authorization: z.string().regex(bearerTokenRegex, 'Invalid Bearer token format').optional(),
})

// export const logoutSchema = z.object({
//     headers: authorizationHeaderSchema,
//     body: logoutBodySchema,
// })

/**
 * Refresh token schema (for POST /refresh)
 */
export const refreshTokenSchema = z.object({
    refreshToken: z.string().regex(jwtPattern, 'Invalid JWT refresh token format'),
})

/**
 * Refresh token token schema (for GET /refresh)
 */
export const cookiesSchema = z.object({
    refreshToken: z.string().regex(jwtPattern, 'Invalid JWT token format'),
})

/**
 * Verify Access Token body schema (POST /verify-token)
 */
export const verifyAccessTokenBodySchema = z
    .object({
        access_token: z.string().regex(jwtPattern, 'Invalid JWT access token format').optional(),
        accessToken: z.string().regex(jwtPattern, 'Invalid JWT access token format').optional(),
    })
    .refine((data) => data.access_token !== undefined || data.accessToken !== undefined, {
        message: 'Either access_token or accessToken must be provided',
        path: ['access_token', 'accessToken'],
    })

/**
 * Verify Access Token body schema (GET /verify-token)
 */
export const accessTokenQuerySchema = z.object({
    access_token: z.string().regex(jwtPattern, 'Invalid JWT access token format').optional(),
    accessToken: z.string().regex(jwtPattern, 'Invalid JWT access token format').optional(),
})

export const verifyAccessTokenSchema = z
    .object({
        headers: authorizationHeaderSchema,
        query: accessTokenQuerySchema,
    })
    .refine(
        (data) =>
            data.headers.authorization !== undefined ||
            data.query.access_token !== undefined ||
            data.query.accessToken !== undefined,
        {
            message: 'Access token must be provided in Authorization header or query parameters',
            path: ['authorization', 'access_token', 'accessToken'],
        },
    )

// Схема для валідації скидання пароля (з токеном скидання)
export const resetPasswordSchema = z
    .object({
        token: z
            .string({
                required_error: 'Reset token is required.',
                invalid_type_error: 'Reset token must be a string.',
            })
            .min(1, { message: 'Reset token cannot be empty.' })
            .trim(),
        newPassword: z
            .string()
            .min(8, { message: 'New password must be at least 8 characters long.' })
            .max(128, { message: 'New password cannot exceed 128 characters.' })
            .regex(/[a-z]/, { message: 'New password must contain at least one lowercase letter.' })
            .regex(/[A-Z]/, { message: 'New password must contain at least one uppercase letter.' })
            .regex(/[0-9]/, { message: 'New password must contain at least one number.' })
            .regex(/[^a-zA-Z0-9]/, {
                message: 'New password must contain at least one special character.',
            }),
        confirmNewPassword: z.string().optional(),
    })
    .refine((data) => data.newPassword === data.confirmNewPassword, {
        message: 'New passwords do not match.',
        path: ['confirmNewPassword'],
    })

// Схема для валідації активації облікового запису
export const activateAccountSchema = z.object({
    token: z
        .string({
            required_error: 'Activation token is required.',
            invalid_type_error: 'Activation token must be a string.',
        })
        .min(1, { message: 'Activation token cannot be empty.' })
        .trim(),
})

// Схема для валідації зміни пароля
export const changePasswordSchema = z
    .object({
        oldPassword: z.string().min(1, { message: 'Old password is required.' }),
        newPassword: z
            .string()
            .min(1, { message: 'New password must be at least 8 characters long.' })
            .max(128, { message: 'New password cannot exceed 128 characters.' }),
        /*.regex(/[a-z]/, { message: 'New password must contain at least one lowercase letter.' })
            .regex(/[A-Z]/, { message: 'New password must contain at least one uppercase letter.' })
            .regex(/[0-9]/, { message: 'New password must contain at least one number.' })
            .regex(/[^a-zA-Z0-9]/, {
                message: 'New password must contain at least one special character.',
            })*/ // Якщо ви хочете підтвердження нового пароля
        confirmNewPassword: z.string().optional(),
    })
    .refine((data) => data.newPassword === data.confirmNewPassword, {
        message: 'New passwords do not match.',
        path: ['confirmNewPassword'],
    })

// Схема для валідації запиту на скидання пароля (зазвичай за email)
export const forgotPasswordRequestSchema = z.object({
    email: z.string().email({ message: 'Invalid email address.' }).trim().toLowerCase(),
})
