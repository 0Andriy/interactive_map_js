import { z } from 'zod'

export const UserQuerySchema = z.object({
    page: z
        .string()
        .optional()
        .transform((v) => parseInt(v) || 1),
    limit: z
        .string()
        .optional()
        .transform((v) => parseInt(v) || 10),
    search: z.string().optional().default(''),
})

export const CreateUserSchema = z.object({
    username: z.string().min(3, 'Мінімум 3 символи'),
    email: z.string().email('Невірний формат email'),
    password: z.string().min(8, 'Мінімум 8 символів'),
    roles: z.array(z.string()).optional(),
})

export const UpdateUserSchema = CreateUserSchema.partial()

export const UserIdParamSchema = z.object({
    id: z.string().min(1, "ID обов'язковий"),
})
