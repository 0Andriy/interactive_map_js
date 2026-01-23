// src/modules/auth/auth.ctrl.js
export class AuthController {
    constructor(authService) {
        this.authService = authService
    }

    handleLogin = async (req, res) => {
        const user = await this.authService.login(req.body.id)
        res.json(user)
    }
}
