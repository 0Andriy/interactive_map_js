// src/routes/v1/auth/schemas/authSchemas.js
import { z } from 'zod'

export const registerSchema = z.object({
    username: z
        .string()
        .min(3, { message: "Ім'я користувача має бути щонайменше 3 символи." })
        .max(30, { message: "Ім'я користувача не може перевищувати 30 символів." })
        .regex(/^[a-zA-Z0-9]+$/, {
            message: "Ім'я користувача може містити лише літери та цифри.",
        }),
    email: z.string().email({ message: 'Недійсний формат електронної пошти.' }),
    password: z.string().min(6, { message: 'Пароль має бути щонайменше 6 символів.' }),
    roles: z.array(z.string()).optional(),
})

export const loginSchema = z.object({
    email: z.string().email({ message: 'Недійсний формат електронної пошти.' }),
    password: z.string().min(6, { message: 'Пароль має бути щонайменше 6 символів.' }),
})

export const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1, { message: 'Токен оновлення не може бути порожнім.' }),
})
