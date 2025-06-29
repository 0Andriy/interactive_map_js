import { z } from 'zod'

// Схема для створення нового користувача (наприклад, адміністратором)
export const createUserSchema = z.object({
    username: z
        .string({
            required_error: 'Username is required',
        })
        .min(3, 'Username must be at least 3 characters long')
        .max(30),
    email: z
        .string({
            required_error: 'Email is required',
        })
        .email('Invalid email address'),
    password: z
        .string({
            required_error: 'Password is required',
        })
        .min(8, 'Password must be at least 8 characters long'),
    firstName: z.string().min(2).max(50).optional(),
    lastName: z.string().min(2).max(50).optional(),
    roles: z.array(z.string()).optional(), // Наприклад ['user', 'editor']
})

// Схема для оновлення даних користувача
// .partial() робить всі поля необов'язковими
// .refine() перевіряє, що хоча б одне поле було передано для оновлення
export const updateUserSchema = z
    .object({
        firstName: z.string().min(2).max(50),
        lastName: z.string().min(2).max(50),
        email: z.string().email('Invalid email address'),
        isActive: z.boolean(),
    })
    .partial()
    .refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field must be provided for update',
    })

// Схема для призначення ролі користувачеві
export const assignRoleSchema = z.object({
    roleName: z.string({
        required_error: 'Role name is required',
    }),
})
