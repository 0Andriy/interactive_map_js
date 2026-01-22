// auth-service/src/infrastructure/keys.js
import * as jose from 'jose'

// В реальном проекте ключи генерируются один раз и хранятся в Vault/Secrets Manager
const { publicKey, privateKey } = await jose.generateKeyPair('RS256')

export const getPrivateKey = () => privateKey
export const getPublicKeyJWK = async () => {
    const jwk = await jose.exportJWK(publicKey)
    return { keys: [{ ...jwk, kid: 'v1-key', alg: 'RS256', use: 'sig' }] }
}
