import { TokenRegistry } from './token-registry.js'
import { JwtService } from './jwt.service.js'

export const keyResolver = async (typeId, header, operation) => {
    // Шукаємо конфіг за id (access, refresh, etc.)
    const config = Object.values(TokenRegistry).find((t) => t.id === typeId)

    if (!config) throw new Error(`Unknown token type: ${typeId}`)

    const keyData = config.keys

    // Якщо алгоритм симетричний (HS)
    if (config.algorithm.startsWith('HS')) {
        return JwtService.transformToJoseKey(keyData.secret, config.algorithm)
    }

    // Якщо асиметричний (RS, ES)
    const key = operation === 'sign' ? keyData.private : keyData.public
    return JwtService.transformToJoseKey(key, config.algorithm, operation)
}
