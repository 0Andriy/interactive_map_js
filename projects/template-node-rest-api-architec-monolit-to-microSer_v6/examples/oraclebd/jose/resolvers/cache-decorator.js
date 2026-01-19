import { LRUCache } from 'lru-cache'

const globalCache = new LRUCache({ max: 100, ttl: 1000 * 60 * 10 })

export const withCache = (resolver, cacheInstance = globalCache) => {
    return async (header, payload, operation) => {
        const cacheKey = `${operation}:${header.alg}:${header.kid}`
        if (cacheInstance.has(cacheKey)) return cacheInstance.get(cacheKey)

        const key = await resolver(header, payload, operation)
        cacheInstance.set(cacheKey, key)
        return key
    }
}
