// user-service/src/infrastructure/token-verifier.js
import * as jose from 'jose'
import { config } from '../config/index.js'

// Создаем "удаленный набор ключей" с кешированием
const JWKS = jose.createRemoteJWKSet(new URL(`${config.authServiceUrl}/.well-known/jwks.json`))

export const verifyToken = async (token) => {
    const { payload } = await jose.jwtVerify(token, JWKS, {
        issuer: 'auth-service',
        audience: 'my-microservices-app',
    })
    return payload
}
