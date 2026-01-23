import { TokenRegistry } from './tokenRegistry.js'
import { JwtService } from './JwtService.js'

export const keyResolver = async (tokenType, header, operation) => {
    // tokenType теперь всегда равен значению поля .id из Registry

    if (tokenType === TokenRegistry.ACCESS.id) {
        return await JwtService.transformToJoseKey(process.env.ACCESS_KEY, header.alg, operation)
    }

    if (tokenType === TokenRegistry.REFRESH.id) {
        return await JwtService.transformToJoseKey(
            process.env.REFRESH_SECRET,
            header.alg,
            operation,
        )
    }

    // ... и так далее
}
