import { CreateUserDto } from './dto/create-user.dto.js'

export class UsersController {
    /**
     * @param {UsersService} usersService
     */
    constructor(usersService) {
        this.usersService = usersService // Внедряем сервис
        // Привязываем контекст для методов, если они используются в роутах Express
        this.signUp = this.signUp.bind(this)
        this.getMe = this.getMe.bind(this)
        this.getProfileByEmail = this.getProfileByEmail.bind(this)
    }

    async signUp(req, res) {
        try {
            const dbAlias = req.headers['x-db-alias'] || 'CORE_UA'

            const validatedData = CreateUserDto.parse(req.body)
            const user = await this.usersService.register(dbAlias, validatedData)

            res.status(201).json(user.toResponse())
        } catch (err) {
            const status = err.errors ? 400 : 500
            res.status(status).json({ error: err.message, details: err.errors })
        }
    }

    /**
     * Отримання даних поточного авторизованого користувача
     */
    async getMe(req, res) {
        try {
            // req.user заповнюється в authGuard
            const dbAlias = req.headers['x-db-alias'] || 'CORE_UA'
            const user = await this.usersService.findByEmail(dbAlias, req.user.email)

            if (!user) {
                return res.status(404).json({ error: 'User not found' })
            }

            res.status(200).json(user.toResponse())
        } catch (err) {
            res.status(500).json({ error: err.message })
        }
    }

    /**
     * Пошук профілю за email (приклад адміністративної дії)
     */
    async getProfileByEmail(req, res) {
        try {
            const { email } = req.params
            const dbAlias = req.headers['x-db-alias'] || 'CORE_UA'

            const user = await this.usersService.findByEmail(dbAlias, email)

            if (!user) {
                return res.status(404).json({ error: 'Profile not found' })
            }

            res.status(200).json(user.toResponse())
        } catch (err) {
            res.status(500).json({ error: err.message })
        }
    }
}
