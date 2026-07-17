// api.js
import { FetchClient } from './FetchClient.js'
import { AuthClientDecorator } from './AuthClientDecorator.js'
import { TimeoutClientDecorator } from './TimeoutClientDecorator.js'
import { RetryClientDecorator } from './RetryClientDecorator.js'
import { CacheClientDecorator } from './CacheClientDecorator.js'
import { ParsingClientDecorator } from './ParsingClientDecorator.js'

// 1. Базова конфігурація
const baseClient = new FetchClient({
    apiBase: 'https://yourproduction.com',
    defaultHeaders: {
        Accept: 'application/json',
        'X-App-Version': '1.0.0',
    },
})

// 2. Налаштування авторизації
const authConfig = {
    getAccessToken: async () => localStorage.getItem('accessToken'),
    refreshTokens: async () => {
        // Логіка оновлення токенів (або залиште null для дефолтної через fetch)
        return 'new_refreshed_token'
    },
}

// 3. Збірка ланцюжка (порядок декораторів критично важливий!)
const authLayer = new AuthClientDecorator(baseClient, authConfig)
const timeoutLayer = new TimeoutClientDecorator(authLayer, 5000) // 5 секунд за замовчуванням
const retryLayer = new RetryClientDecorator(timeoutLayer, { retries: 2, delay: 1000 })
const cacheLayer = new CacheClientDecorator(retryLayer, { defaultTtl: 3 * 60 * 1000 }) // 3 хвилини

// Фінальний зовнішній шар, який віддаватиме розробнику готові дані (JSON/Text)
export const api = new ParsingClientDecorator(cacheLayer)
