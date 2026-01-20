import * as jose from 'jose'

/**
 * @typedef {Object} TokenOptions
 * @description Configuration for JWT generation and validation.
 * @property {string} [algorithm] - Signature algorithm (e.g., 'RS256', 'ES256', 'HS256').
 * @property {string|number} [expiresIn] - Token TTL (e.g., '1h', '24h', '7d').
 * @property {string} [issuer] - Token issuer (iss claim).
 * @property {string} [audience] - Token audience (aud claim).
 * @property {string} [subject] - Token subject (sub claim).
 * @property {string} [jwtId] - Token unique ID (jti claim).
 * @property {string} [kid] - Key Identifier used by resolvers to find the key.
 * @property {number} [clockSkewOffset] - Seconds to backdate 'iat' for clock sync issues.
 * @property {string|number} [clockTolerance] - Allowed clock drift during verification (e.g., '30s').
 * @property {Object} [customHeaders] - Additional protected headers.
 */

/**
 * JwtService — High-level wrapper for 'jose' library.
 * Implements Dependency Injection for key resolution and multi-strategy support.
 */
export class JwtService {
    /**
     * @param {Object} config - Configuration object.
     * @param {Function} config.keyResolver - Async function (header, payload, op) => Promise<Key>.
     * @param {TokenOptions} [config.defaultOptions] - Global default settings.
     */
    constructor({ keyResolver, defaultOptions = {} }) {
        this.keyResolver = keyResolver
        this.defaultOptions = {
            algorithm: 'RS256',
            expiresIn: '1h',
            issuer: 'auth-service',
            clockSkewOffset: 10,
            clockTolerance: '30s',
            ...defaultOptions,
        }
        this.internalTimeOffset = 0
    }

    /**
     * Static method to transform raw data (PEM string or Buffer) into jose-compatible keys.
     * @param {Object|string} keySource - Raw key data (PEM strings or object with secrets).
     * @param {string} alg - JWT algorithm.
     * @param {'sign'|'verify'} operation - Operation type.
     * @returns {Promise<jose.KeyLike|Uint8Array>}
     * @example
     * const key = await JwtService.transformToJoseKey('PEM_DATA', 'RS256', 'sign');
     */
    static async transformToJoseKey(keySource, alg, operation) {
        if (alg.startsWith('HS')) {
            const secret = keySource.secret || keySource
            return new TextEncoder().encode(secret)
        }

        if (operation === 'sign') {
            const privatePem = keySource.private_key || keySource
            return await jose.importPKCS8(privatePem, alg)
        } else {
            const publicPem = keySource.public_key || keySource
            return await jose.importSPKI(publicPem, alg)
        }
    }

    /**
     * Generates and signs a new JWT.
     * @param {Object} payload - Data to be encoded in the token.
     * @param {TokenOptions} [overrideOptions={}] - Call-specific overrides.
     * @returns {Promise<string>} Signed JWT string.
     * @example
     * const token = await jwtService.sign({ user_id: 123 }, { expiresIn: '2h', kid: 'key_v1' });
     */
    async sign(payload, overrideOptions = {}) {
        const opt = { ...this.defaultOptions, ...overrideOptions }
        const key = await this.keyResolver({ alg: opt.algorithm, kid: opt.kid }, payload, 'sign')

        const now = Math.floor(Date.now() / 1000)
        const adjustedIat = now + this.internalTimeOffset - opt.clockSkewOffset

        const jwt = new jose.SignJWT(payload)
            .setProtectedHeader({
                alg: opt.algorithm,
                kid: opt.kid,
                typ: 'JWT',
                ...opt.customHeaders,
            })
            .setIssuedAt(adjustedIat)
            .setNotBefore(adjustedIat)

        if (opt.expiresIn) jwt.setExpirationTime(opt.expiresIn)
        if (opt.issuer) jwt.setIssuer(opt.issuer)
        if (opt.audience) jwt.setAudience(opt.audience)
        if (opt.subject) jwt.setSubject(opt.subject)
        if (opt.jwtId) jwt.setJti(opt.jwtId)

        return await jwt.sign(key)
    }

    /**
     * Verifies a JWT and returns its decoded payload and header.
     * @param {string} token - The JWT string to verify.
     * @param {TokenOptions} [overrideOptions={}] - Verification overrides.
     * @returns {Promise<{payload: Object, header: Object}>}
     * @example
     * const { payload } = await jwtService.verify(token, { issuer: 'trusted-source' });
     */
    async verify(token, overrideOptions = {}) {
        const opt = { ...this.defaultOptions, ...overrideOptions }
        try {
            const result = await jose.jwtVerify(
                token,
                async (header, payload) => await this.keyResolver(header, payload, 'verify'),
                {
                    algorithms: [opt.algorithm],
                    issuer: opt.issuer,
                    audience: opt.audience,
                    clockTolerance: opt.clockTolerance,
                },
            )
            return { payload: result.payload, header: result.protectedHeader }
        } catch (error) {
            throw new Error(`JWT verification failed: ${error.message}`)
        }
    }

    /**
     * Decodes the payload without signature verification.
     * @param {string} token - JWT string.
     * @returns {Object} Decoded payload.
     */
    decode(token) {
        try {
            return jose.decodeJwt(token)
        } catch (e) {
            throw new Error(`Failed to decode JWT payload: ${e.message}`)
        }
    }

    /**
     * Decodes the header without signature verification. Useful for pre-fetching 'kid'.
     * @param {string} token - JWT string.
     * @returns {Object} Protected header.
     */
    decodeHeader(token) {
        try {
            return jose.decodeProtectedHeader(token)
        } catch (e) {
            throw new Error(`Failed to decode JWT header: ${e.message}`)
        }
    }

    /**
     * Generates a Public JWKS from a list of database key records.
     * @param {Array<Object>} dbKeys - Array of raw key objects from DB.
     * @returns {Promise<{keys: Array<Object>}>}
     */
    async getPublicJwks(dbKeys) {
        const keys = []
        for (const keyData of dbKeys) {
            const imported = await JwtService.transformToJoseKey(
                keyData,
                keyData.algorithm,
                'verify',
            )
            const jwk = await jose.exportJWK(imported)
            keys.push({ ...jwk, kid: keyData.kid, alg: keyData.algorithm, use: 'sig' })
        }
        return { keys }
    }
}
