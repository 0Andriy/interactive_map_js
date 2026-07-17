// HttpClientFactory.js
import { FetchClient } from './FetchClient.js'
import { AuthClientDecorator } from './AuthClientDecorator.js'
import { TimeoutClientDecorator } from './TimeoutClientDecorator.js'
import { RetryClientDecorator } from './RetryClientDecorator.js'
import { CacheClientDecorator } from './CacheClientDecorator.js'
import { ParsingClientDecorator } from './ParsingClientDecorator.js'

export class HttpClientFactory {
    /**
     * Створює публічний клієнт (наприклад, для лендінгів, каталогів або авторизації)
     * Тут немає перевірки токенів, але є таймаути та ретраї.
     */
    static createPublicClient(apiBase) {
        const base = new FetchClient({ apiBase })
        const timeout = new TimeoutClientDecorator(base, 5000)
        const retry = new RetryClientDecorator(timeout, { retries: 2, delay: 500 })
        const cache = new CacheClientDecorator(retry, { defaultTtl: 60000 })

        return new ParsingClientDecorator(cache)
    }

    /**
     * Створює захищений клієнт із повною підтримкою JWT авторизації та рефрешу
     */
    static createAuthenticatedClient(apiBase, authConfig = {}) {
        const base = new FetchClient({ apiBase })
        const auth = new AuthClientDecorator(base, authConfig)
        const timeout = new TimeoutClientDecorator(auth, 6000)
        const retry = new RetryClientDecorator(timeout, { retries: 3, delay: 1000 })
        const cache = new CacheClientDecorator(retry, { defaultTtl: 5 * 60 * 1000 })

        return new ParsingClientDecorator(cache)
    }

    /**
     * Створює клієнт для специфічних завдань (наприклад, Upload/Download великих файлів)
     * Вимкнено таймаути та ретраї, щоб не обривати завантаження гігабайтних файлів.
     */
    static createMediaClient(apiBase, authConfig = {}) {
        const base = new FetchClient({ apiBase })
        const auth = new AuthClientDecorator(base, authConfig)
        return new ParsingClientDecorator(auth)
    }
}
