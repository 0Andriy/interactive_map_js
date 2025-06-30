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

// Схема для валідації зміни пароля для власника
export const changeOwnPasswordSchema = z
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

// Схема для валідації зміни пароля для адміна (без потреби вказувати старий)
export const adminChangeUserPasswordSchema = z.object({
    // Адмін задає новий пароль користувачу — без потреби вказувати старий
    new_password: z
        .string()
        .min(1, 'Пароль має містити щонайменше 8 символів')
        .regex(/[A-Z]/, 'Має містити хоча б одну велику літеру')
        .regex(/[a-z]/, 'Має містити хоча б одну малу літеру')
        .regex(/[0-9]/, 'Має містити хоча б одну цифру')
        .regex(/[^A-Za-z0-9]/, 'Має містити хоча б один спеціальний символ'),
})
