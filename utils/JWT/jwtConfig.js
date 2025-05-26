// jwtConfig.js
export const tokenConfigs = {
    access: {
        source: 'env',
        secretEnvKey: 'JWT_ACCESS_SECRET',
        expiresIn: '15m',
        cacheTTLSeconds: 300, // кеш 5 хв
        signOptions: {
            algorithm: 'HS256',
            issuer: 'myapp.com',
        },
        verifyOptions: {
            algorithms: ['HS256'],
            issuer: 'myapp.com',
            audience: 'users',
        },
    },
    refresh: {
        source: 'db',
        expiresIn: '7d',
        cacheTTLSeconds: 600, // кеш 10 хв
        signOptions: {
            algorithm: 'HS512',
        },
        verifyOptions: {
            algorithms: ['HS512'],
        },
    },
    emailVerification: {
        source: 'env',
        secretEnvKey: 'JWT_EMAIL_SECRET',
        expiresIn: '1d',
    },
}
