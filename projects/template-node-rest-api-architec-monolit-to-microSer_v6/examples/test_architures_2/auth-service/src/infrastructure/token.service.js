import * as jose from 'jose'

export class TokenService {
    constructor(jwtConfig) {
        this.aSecret = new TextEncoder().encode(jwtConfig.accessSecret)
        this.rSecret = new TextEncoder().encode(jwtConfig.refreshSecret)
    }

    async generatePair(payload) {
        const accessToken = await new jose.SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('15m')
            .sign(this.aSecret)

        const refreshToken = await new jose.SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('7d')
            .sign(this.rSecret)

        return { accessToken, refreshToken }
    }
}
