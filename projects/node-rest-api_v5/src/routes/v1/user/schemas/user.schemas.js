// src/routes/v1/user/schemas/user.schema.js
import { z } from 'zod'

// Схема для валідації оновлення даних користувача
// .partial() дозволяє зробити всі поля необов'язковими для PATCH-запитів
export const updateUserSchema = z
    .object({
        username: z
            .string()
            .min(3, { message: 'Username must be at least 3 characters long.' })
            .max(50, { message: 'Username cannot exceed 50 characters.' })
            .trim()
            .optional(),
        email: z
            .string()
            .email({ message: 'Invalid email address.' })
            .max(100, { message: 'Email cannot exceed 100 characters.' })
            .trim()
            .toLowerCase()
            .optional(),
        firstName: z
            .string()
            .min(1, { message: 'First name is required.' })
            .max(50, { message: 'First name cannot exceed 50 characters.' })
            .trim()
            .optional(),
        lastName: z
            .string()
            .min(1, { message: 'Last name is required.' })
            .max(50, { message: 'Last name cannot exceed 50 characters.' })
            .trim()
            .optional(),
        isActive: z.boolean().optional(),
        isEmailVerified: z.boolean().optional(),
        roles: z.array(z.string()).optional(), // Наприклад, масив рядків для ролей
    })
    .partial() // Це дозволяє надсилати лише ті поля, які ви хочете оновити
