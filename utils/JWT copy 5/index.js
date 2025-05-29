import JwtManager from './JwtManager.js'

// Приклад loader з бази (можна передати в config)
const dbLoader = async (keyId) => {
    // Наприклад, читаємо ключ з БД
    return { secret: `db-secret-for-${keyId}` }
}

const jwt = JwtManager.getInstance({
    tokenTypes: {
        access: {
            algorithm: 'RS256',
            keySource: 'file',
            privateKeyPath: './keys/private.pem',
            publicKeyPath: './keys/public.pem',
            expiresIn: '15m',
            cacheTTL: 5 * 60 * 1000,
            kid: 'my-key-id-1',
            payloadValidator: (payload) => {
                const errors = []
                if (!payload.sub) errors.push('Missing sub')
                if (payload.exp && payload.exp < Date.now() / 1000) errors.push('Expired token')
                return { isValid: errors.length === 0, errors }
            },
        },
        refresh: {
            algorithm: 'HS256',
            keySource: 'env',
            secretKey: 'REFRESH_TOKEN_SECRET',
            expiresIn: '7d',
            cacheTTL: 60 * 60 * 1000,
            payloadValidator: (payload) => ({ isValid: true, errors: [] }),
        },
        magic: {
            algorithm: 'HS256',
            keySource: 'db',
            loader: dbLoader,
            keyId: 'magic-key-123',
            expiresIn: '1h',
            cacheTTL: 30 * 1000,
        },
        external: {
            algorithm: 'RS256',
            keySource: 'jwks',
            jwksUri: 'https://example.com/.well-known/jwks.json',
            cacheTTL: 10 * 60 * 1000,
            payloadValidator: (payload) => {
                const errors = []
                if (!payload.iss || payload.iss !== 'trusted-issuer') errors.push('Invalid issuer')
                return { isValid: errors.length === 0, errors }
            },
        },
    },
})

// Приклад використання

;(async () => {
    // Підписати токен
    const token = await jwt.sign({ sub: 'user1', role: 'admin' }, 'access', {
        audience: 'myapp.com',
        issuer: 'myapp',
    })
    console.log('Signed Access Token:', token)

    // Перевірити токен
    try {
        const payload = await jwt.verify(token, 'access')
        console.log('Verified Payload:', payload)
    } catch (err) {
        console.error('Verify error:', err.message)
    }

    // Декодувати токен (без перевірки)
    const decoded = await jwt.decode(token)
    console.log('Decoded token:', decoded)

    // Примусово оновити ключі
    await jwt.forceReload('access')

    // Запустити автооновлення ключів у фоні
    jwt.startAutoRefresh(60000) // кожні 60 секунд
})()
