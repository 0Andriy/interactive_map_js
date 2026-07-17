import { z } from 'zod'

/**
 * Схема для валідації параметрів шляху (ID)
 */
export const RoleIdParamSchema = z.object({
    id: z.string().regex(/^\d+$/, 'ID має складатися лише з цифр').transform(Number),
})

/**
 * Схема для створення тіла ролі
 */
export const CreateRoleSchema = z.object({
    name: z.string().min(2, 'Назва занадто коротка').max(50, 'Назва занадто довга'),
    description: z.string().max(255, 'Опис не може перевищувати 255 символів').optional(),
})

/**
 * Схема для оновлення тіла ролі
 */
export const UpdateRoleSchema = CreateRoleSchema.partial()
