// src/routes/v1/auth/schemas/auth.schemas.js
import { z } from 'zod'

// Допоміжна схема для пароля (для повторного використання)
const passwordSchema = z
    .string()
    .transform((str) => str.trim()) // обрізаємо пробіли
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).*$/, {
        message:
            'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.',
    })
    .refine((value) => value.trim().length > 0, {
        // Додаємо перевірку на порожній рядок або лише пробіли
        message: 'Password cannot be empty or just spaces.',
    })

export const registerSchema = z.object({
    username: z
        .string()
        .transform((str) => str.trim())
        .min(3, 'Username must be at least 3 characters long')
        .max(30, 'Username must not exceed 30 characters'),
    email: z.string().email('Invalid email address').trim(),
    password: passwordSchema,
})

export const loginSchema = z.object({
    email: z
        .string()
        .transform((str) => str.trim())
        .email('Invalid email address')
        .trim(),
    password: z
        .string()
        .transform((str) => str.trim())
        .min(1, 'Password is required')
        .trim(),
})

export const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
})

export const forgotPasswordSchema = z.object({
    email: z
        .string()
        .transform((str) => str.trim())
        .email('Invalid email address')
        .trim(),
})

export const resetPasswordSchema = z
    .object({
        newPassword: passwordSchema,
        confirmNewPassword: passwordSchema, // Повторно використовуємо passwordSchema для валідації формату
        // .refine((value, ctx) => value === ctx.parent.newPassword, {
        //     message: 'New password and confirm password do not match',
        //     path: ['confirmNewPassword'], // Вказуємо шлях для помилки
        // }),
    })
    .superRefine(({ newPassword, confirmNewPassword }, ctx) => {
        if (newPassword !== confirmNewPassword) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'New password and confirm password do not match',
                path: ['confirmNewPassword'],
            })
        }
    })

export const resendVerificationEmailSchema = z.object({
    email: z
        .string()
        .transform((str) => str.trim())
        .email('Invalid email address')
        .trim(),
})

export const changePasswordSchema = z.object({
    currentPassword: z
        .string()
        .transform((str) => str.trim())
        .min(1, 'Current password is required')
        .trim(),
    newPassword: passwordSchema,
    confirmNewPassword: passwordSchema // Повторно використовуємо passwordSchema для валідації формату
        .refine((value, ctx) => value === ctx.parent.newPassword, {
            message: 'New password and confirm password do not match',
            path: ['confirmNewPassword'],
        }),
})

// Додамо схему для перевірки токенів в тілі (якщо accessToken може бути порожнім)
export const verifyTokenBodySchema = z.object({
    accessToken: z
        .string()
        .transform((str) => str.trim())
        .min(1, 'Access token is required')
        .trim(),
})
