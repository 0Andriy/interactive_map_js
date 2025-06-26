// src/routes/v1/auth/schemas/auth.schemas.js
import { z } from 'zod'

// Схема для валідації даних реєстрації
export const registerSchema = z.object({
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
        .min(8, { message: 'Password must be at least 8 characters long.' })
        .max(128, { message: 'Password cannot exceed 128 characters.' })
        .regex(/[a-z]/, { message: 'Password must contain at least one lowercase letter.' })
        .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter.' })
        .regex(/[0-9]/, { message: 'Password must contain at least one number.' })
        .regex(/[^a-zA-Z0-9]/, {
            message: 'Password must contain at least one special character.',
        }),
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

// Схема для валідації даних входу
export const loginSchema = z.object({
    username: z
        .string()
        .min(1, { message: 'Username is required.' })
        .max(50, { message: 'Username cannot exceed 50 characters.' })
        .trim(),
    password: z
        .string()
        .min(1, { message: 'Password is required.' })
        .max(128, { message: 'Password cannot exceed 128 characters.' }),
})

// Схема для валідації refresh токена (якщо він передається в тілі, а не тільки в куках)
export const refreshTokenSchema = z.object({
    refreshToken: z
        .string({
            required_error: 'Refresh token is required.',
            invalid_type_error: 'Refresh token must be a string.',
        })
        .min(1, { message: 'Refresh token cannot be empty.' })
        .trim(),
})

// Схема для валідації зміни пароля
export const changePasswordSchema = z
    .object({
        oldPassword: z.string().min(1, { message: 'Old password is required.' }),
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
        // Якщо ви хочете підтвердження нового пароля
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
