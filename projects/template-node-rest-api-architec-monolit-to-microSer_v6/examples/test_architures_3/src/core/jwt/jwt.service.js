import * as jose from 'jose'

export class JwtService {
    constructor(typeId, defaultOptions, keyResolver) {
        this.typeId = typeId
        this.defaultOptions = defaultOptions
        this.keyResolver = keyResolver
        this.internalTimeOffset = 0
    }

    async setGlobalTimeOffset(seconds = 0) {
        this.internalTimeOffset = seconds
    }

    static async transformToJoseKey(keySource, alg, operation) {
        if (alg.startsWith('HS')) {
            const secret = typeof keySource === 'object' ? keySource.secret : keySource
            return new TextEncoder().encode(secret)
        }

        if (operation === 'sign') {
            const privatePem = keySource.private_key || keySource.private || keySource
            return await jose.importPKCS8(privatePem, alg)
        } else {
            const publicPem = keySource.public_key || keySource.public || keySource
            return await jose.importSPKI(publicPem, alg)
        }
    }

    async sign(payload, overrideOptions = {}) {
        const opt = { ...this.defaultOptions, ...overrideOptions }
        const key = await this.keyResolver(this.typeId, { alg: opt.algorithm }, 'sign')

        const now = Math.floor(Date.now() / 1000)
        const adjustedIat = now + this.internalTimeOffset - (opt.clockSkewOffset || 0)

        const jwt = new jose.SignJWT({ ...payload, token_type: this.typeId })
            .setProtectedHeader({ alg: opt.algorithm, typ: 'JWT', ...opt.customHeaders })
            .setIssuedAt(adjustedIat)
            .setExpirationTime(opt.expiresIn)
            .setIssuer(opt.issuer)

        if (opt.audience) jwt.setAudience(opt.audience)
        if (opt.subject) jwt.setSubject(opt.subject)

        jwt.setNotBefore(opt.notBefore || adjustedIat)

        return await jwt.sign(key)
    }

    async verify(token, overrideOptions = {}) {
        const opt = { ...this.defaultOptions, ...overrideOptions }

        try {
            const { payload, protectedHeader } = await jose.jwtVerify(
                token,
                async (header) => await this.keyResolver(this.typeId, header, 'verify'),
                {
                    algorithms: [opt.algorithm],
                    issuer: opt.issuer,
                    clockTolerance: opt.clockTolerance,
                },
            )

            if (payload.token_type !== this.typeId) {
                throw new Error(`Invalid token type: expected ${this.typeId}`)
            }

            return { payload, header: protectedHeader }
        } catch (error) {
            throw new Error(`${this.typeId} token verification failed: ${error.message}`)
        }
    }

    decode(token) {
        return {
            payload: jose.decodeJwt(token),
            header: jose.decodeProtectedHeader(token),
        }
    }
}
