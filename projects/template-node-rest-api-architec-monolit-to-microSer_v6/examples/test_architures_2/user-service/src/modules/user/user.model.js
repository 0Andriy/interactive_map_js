// src/modules/user/user.model.js
import { z } from 'zod'

// Схема для валідації вхідних даних (Registration)
export const UserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    fullName: z.string().min(2),
})

// Клас-трансформер для виходу (Data Mapper)
export class UserEntity {
    constructor(dbRow) {
        this.id = dbRow.ID || dbRow.id
        this.email = dbRow.EMAIL || dbRow.email
        this.fullName = dbRow.FULL_NAME || dbRow.fullName
        this.roles = dbRow.ROLES ? JSON.parse(dbRow.ROLES) : ['user']
    }
}
