import { z } from 'zod'

export const UserParamSchema = z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
})

export const UserCreateSchema = z.object({
    username: z.string().min(3),
    email: z.string().email(),
    password: z.string().min(6),
    roleIds: z.array(z.number()).optional().default([]),
})

export const UserSyncRolesSchema = z.object({
    roleIds: z.array(z.number()).nonempty(),
})
