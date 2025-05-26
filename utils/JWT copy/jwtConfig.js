export const tokenConfigs = {
    access: {
        source: 'env',
        secretEnvKey: 'JWT_ACCESS_SECRET',
        expiresIn: '15m',
        async: false, // використовується синхронний метод jwt
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
    },
    refresh: {
        source: 'env',
        privateKeyEnv: 'JWT_RS256_PRIVATE_KEY',
        publicKeyEnv: 'JWT_RS256_PUBLIC_KEY',
        expiresIn: '7d',
        async: true, // використовує асинхронний метод jwt
        signOptions: { algorithm: 'RS256' },
        verifyOptions: { algorithms: ['RS256'] },
    },
    emailVerification: {
        source: 'env',
        secretEnvKey: 'JWT_EMAIL_SECRET',
        expiresIn: '1d',
        async: false,
        signOptions: { algorithm: 'HS512' },
        verifyOptions: { algorithms: ['HS512'] },
    },
}
