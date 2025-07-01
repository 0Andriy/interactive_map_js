import { z } from 'zod'

/**
 * Schema for creating a role
 */
export const createRoleSchema = z.object({
    name: z
        .string({
            required_error: 'Role name is required',
        })
        .min(2, 'Role name must be at least 2 characters long')
        .max(50, 'Role name must be no more than 50 characters'),
})

/**
 * Schema for updating a role
 */
export const updateRoleSchema = z.object({
    name: z
        .string()
        .min(2, 'Role name must be at least 2 characters long')
        .max(50, 'Role name must be no more than 50 characters')
        .optional(),
})
