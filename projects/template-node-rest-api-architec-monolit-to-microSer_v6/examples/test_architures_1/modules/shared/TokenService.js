import jwt from 'jsonwebtoken'

export class TokenService {
    constructor(secret) {
        this.secret = secret
    }

    async generate(payload, expiresIn = '24h') {
        return jwt.sign(payload, this.secret, { expiresIn })
    }

    async verify(token) {
        try {
            return jwt.verify(token, this.secret)
        } catch (e) {
            throw new Error('Invalid or expired token')
        }
    }
}
