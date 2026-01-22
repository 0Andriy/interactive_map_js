export class AuthController {
    constructor(authService) {
        this.authService = authService
        this.login = this.login.bind(this)
    }

    async login(req, res) {
        try {
            const dbAlias = req.headers['x-db-alias'] || 'CORE_UA'
            const { email, password } = req.body

            const result = await this.authService.login(dbAlias, { email, password })
            res.status(200).json(result)
        } catch (err) {
            res.status(401).json({ error: err.message })
        }
    }
}
