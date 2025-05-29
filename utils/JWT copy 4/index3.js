import JwtManager from './JwtManager.js'

// Симуляція loader з бази
const getKeyFromDb = async (keyId) => {
    return { secret: `db-secret-for-${keyId}` }
}

const jwt = new JwtManager({
    tokenTypes: {
        access: {
            algorithm: 'RS256',
            keySource: 'file',
            privateKeyPath: './keys/private.pem',
            publicKeyPath: './keys/public.pem',
            expiresIn: '10m',
            cacheTTL: 3 * 60 * 1000,
        },
        magic: {
            algorithm: 'HS256',
            keySource: 'db',
            keyId: 'magic-key-1',
            loader: getKeyFromDb,
            expiresIn: '2m',
            cacheTTL: 30 * 1000,
        },
    },
})

// ✅ Стартуємо автооновлення
jwt.startAutoRefresh(20000) // кожні 20 сек

const main = async () => {
    const token = await jwt.sign({ userId: 42 }, 'magic')
    const data = await jwt.verify(token, 'magic')
    const decoded = await jwt.decode(token)

    console.log('Signed:', token)
    console.log('Verified:', data)
    console.log('Decoded:', decoded)

    // Примусово оновити ВСІ ключі
    await jwt.forceReload()

    // Зупинити автооновлення (наприклад, перед виходом)
    setTimeout(() => jwt.stopAutoRefresh(), 2 * 60 * 1000)
}

main()
