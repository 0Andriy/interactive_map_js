import bcrypt from 'bcrypt'

export class AuthService {
    constructor(usersService, tokenService, authRepository) {
        this.usersService = usersService
        this.tokenService = tokenService
        this.authRepository = authRepository
    }

    async login(dbAlias, { email, password }) {
        const user = await this.usersService.findByEmail(dbAlias, email)
        if (!user) throw new Error('Користувача не знайдено')

        const isMatch = await bcrypt.compare(password, user.password)
        if (!isMatch) throw new Error('Невірний пароль')

        // Використання вашої обгортки токенів
        const token = await this.tokenService.generate({
            id: user.id,
            email: user.email,
        })

        await this.authRepository.saveToken(dbAlias, { userId: user.id, token })

        return { token, user: user.toResponse() }
    }
}
