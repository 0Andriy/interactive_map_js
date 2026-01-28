// auth.validation.js
import { z } from 'zod'

/**
 * Схема для реєстрації нового користувача.
 */
export const RegisterSchema = z.object({
    username: z
        .string()
        .min(3, 'Логін має бути не менше 3 символів')
        .max(50, 'Логін занадто довгий'),
    email: z.string().email('Невірний формат email'),
    password: z
        .string()
        .min(8, 'Пароль має бути не менше 8 символів')
        .regex(/[A-Z]/, 'Пароль має містити хоча б одну велику літеру')
        .regex(/[0-9]/, 'Пароль має містити хоча б одну цифру'),
    roleIds: z.array(z.number()).optional().default([]),
})

/**
 * Схема для входу в систему.
 */
export const LoginSchema = z.object({
    username: z.string().min(1, 'Вкажіть логін'),
    password: z.string().min(1, 'Вкажіть пароль'),
})

/**
 * Схема для інтроспекції (валідації) токена.
 */
export const TokenValidateSchema = z.object({
    token: z
        .string()
        .min(10, 'Токен занадто короткий')
        .regex(
            /^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/,
            'Невірний формат JWT токена',
        ),
})

/**
 * Схема для оновлення токенів (Refresh Strategy).
 */
export const RefreshSchema = z.object({
    refreshToken: z.string().min(1, "Refresh токен обов'язковий").optional(),
})

/**
 * Схема для зміни пароля.
 */
export const ChangePasswordSchema = z
    .object({
        oldPassword: z.string().min(1, "Старий пароль обов'язковий"),
        newPassword: z
            .string()
            .min(8, 'Новий пароль має бути не менше 8 символів')
            .regex(/[A-Z]/, 'Новий пароль має містити хоча б одну велику літеру'),
    })
    .refine((data) => data.oldPassword !== data.newPassword, {
        message: 'Новий пароль не може збігатися зі старим',
        path: ['newPassword'],
    })
