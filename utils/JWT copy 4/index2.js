import JWTService from './JWTService.js'

// Симуляція завантаження ключа з БД
const getSecretFromDb = async (keyId) => {
    // тут може бути MongoDB, Redis, інше
    return { secret: `secret-from-db-for-${keyId}` }
}

const jwtService = new JWTService({
    tokenTypes: {
        access: {
            algorithm: 'RS256',
            keySource: 'file',
            privateKeyPath: './keys/private.pem',
            publicKeyPath: './keys/public.pem',
            expiresIn: '10m',
            cacheTTL: 10 * 60 * 1000,
        },
        refresh: {
            algorithm: 'HS256',
            keySource: 'env',
            secretKey: 'REFRESH_TOKEN_SECRET',
            expiresIn: '7d',
            cacheTTL: 60 * 60 * 1000,
        },
        magic: {
            algorithm: 'HS256',
            keySource: 'db',
            keyId: 'magic-key-id',
            loader: getSecretFromDb,
            expiresIn: '5m',
            cacheTTL: 30 * 1000,
        },
    },
})

// Використання
const run = async () => {
    const token = await jwtService.sign({ uid: 123 }, 'magic')
    const payload = await jwtService.verify(token, 'magic')
    const decoded = await jwtService.decode(token)

    console.log('Signed Token:', token)
    console.log('Verified Payload:', payload)
    console.log('Decoded Token:', decoded)

    await jwtService.forceReload('magic')
}

run()
