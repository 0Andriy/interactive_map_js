import { FetchClient } from './FetchClient.js'
import { AuthClientDecorator } from './AuthClientDecorator.js'
import { TimeoutClientDecorator } from './TimeoutClientDecorator.js'
import { RetryClientDecorator } from './RetryClientDecorator.js'
import { CacheClientDecorator } from './CacheClientDecorator.js'
import { ParsingClientDecorator } from './ParsingClientDecorator.js'

// --- 1. БАЗОВЕ МЕРЕЖЕВЕ ЯДРО ---
export const fetchClient = new FetchClient({
    apiBase: window.APP_CONFIG?.API_BASE || '',
    defaultHeaders: {},
})

// --- 2. КОНФІГУРАЦІЯ БЕЗПЕКИ Й АВТОРИЗАЦІЇ (JWT & REFRESH) ---
const authConfig = {
    // getAccessToken: async () => {
    //     const accessToken = localStorage.getItem('accessToken')
    //     return accessToken
    // },
    // refreshTokens: async () => {
    //     const base = window.APP_CONFIG?.API_BASE || ''
    //     const refreshToken = localStorage.getItem('refreshToken')
    //     // Локальний метод очищення сесії при критичній помилці авторизації
    //     const handleAuthFailure = (status) => {
    //         localStorage.removeItem('accessToken')
    //         localStorage.removeItem('refreshToken')
    //         window.dispatchEvent(
    //             new CustomEvent('app:auth-expired', {
    //                 detail: { status: status || 401 },
    //             }),
    //         )
    //         // window.location.href = '/login'
    //     }
    //     if (!refreshToken) {
    //         handleAuthFailure(null)
    //         throw new Error('[Auth] Refresh token is missing in storage')
    //     }
    //     try {
    //         const response = await fetch(`${base}/auth/refresh`, {
    //             method: 'POST',
    //             headers: { 'Content-Type': 'application/json' },
    //             body: JSON.stringify({ refreshToken }),
    //         })
    //         if (!response.ok) {
    //             if ([400, 401, 403].includes(response.status)) {
    //                 handleAuthFailure(response.status)
    //                 throw new Error('[Auth] Refresh token expired or invalid, user logged out')
    //             }
    //             throw new Error(`[Auth] Server error during refresh: ${response.status}`)
    //         }
    //         const data = await response.json()
    //         if (!data || !data.accessToken) {
    //             throw new Error('[Auth] Invalid response structure from refresh endpoint')
    //         }
    //         localStorage.setItem('accessToken', data.accessToken)
    //         if (data.refreshToken) {
    //             localStorage.setItem('refreshToken', data.refreshToken)
    //         }
    //         return data.accessToken
    //     } catch (networkError) {
    //         // Перевіряємо, чи це помилка нашого throw, чи реальний обрив мережі
    //         if (networkError.message.startsWith('[Auth]')) throw networkError
    //         throw new Error('[Auth] Network error during token refresh. Retrying later.')
    //     }
    // },
}

// Створюємо базовий шар авторизації
export const authClient = new AuthClientDecorator(fetchClient, authConfig)

// --- 3. НАЛАШТУВАННЯ СТАНДАРТНИХ ПАРАМЕТРІВ ДЕКОРАТОРІВ ---
const defaultTimeout = 5000
const defaultRetryOptions = { retries: 2, delay: 1000 }
const defaultCacheOptions = { defaultTtl: 3 * 60 * 1000 } // 3 хвилини

// --- 4. ЕКСПОРТ ГОТОВИХ API КЛІЄНТІВ (ПОЛІРОВАНІ НАЗВИ СТРУКТУРИ) ---

// Глобальний всеосяжний клієнт (Авторизація + Таймаут + Повторення + Кеш + Автопарсинг)
export const apiClient = new ParsingClientDecorator(
    new CacheClientDecorator(
        new RetryClientDecorator(
            new TimeoutClientDecorator(authClient, defaultTimeout),
            defaultRetryOptions,
        ),
        defaultCacheOptions,
    ),
)

// Швидкі клієнти з кешуванням та повтореннями (для статичних/рідко змінюваних даних)
export const cachedSecureApi = new ParsingClientDecorator(
    new CacheClientDecorator(
        new RetryClientDecorator(
            new TimeoutClientDecorator(authClient, defaultTimeout),
            defaultRetryOptions,
        ),
        defaultCacheOptions,
    ),
)

export const cachedPublicApi = new ParsingClientDecorator(
    new CacheClientDecorator(
        new RetryClientDecorator(
            new TimeoutClientDecorator(fetchClient, defaultTimeout),
            defaultRetryOptions,
        ),
        defaultCacheOptions,
    ),
)

// Прямі клієнти без кешу (для динамічних операцій: створення, видалення, мутації)
export const secureApi = new ParsingClientDecorator(authClient)
export const publicApi = new ParsingClientDecorator(fetchClient)

// Клієнт для фонового довгого опитування (Long Polling / Специфічні короткі таймаути)
export const pollingSecureApi = new ParsingClientDecorator(
    new RetryClientDecorator(new TimeoutClientDecorator(authClient, 4000), {
        retries: 3,
        delay: 1000,
    }),
)

// --- 5. ДОПОМІЖНІ ХЕЛПЕРИ ДЛЯ UI ЕЛЕМЕНТІВ ---

/**
 * Автоматично завантажує захищений бінарний або текстовий ресурс (SVG, картини, PDF) в DOM-елемент
 */
export const setProtectedResource = async (
    element,
    endpoint,
    options = {},
    fallbackUrl = '/img/fallback-error.png',
) => {
    if (!element || typeof element.setAttribute !== 'function') {
        console.error('[ResourceLoader] Target element is invalid or missing')
        return
    }
    if (!endpoint || typeof endpoint !== 'string') {
        console.warn('[ResourceLoader] Endpoint must be a valid string')
        return
    }

    const dataType = options.type || 'blob'
    const cacheConfig = options.customCache || { useCache: true, ttl: 2 * 60 * 60 * 1000 }

    try {
        if (element._currentBlobUrl) {
            URL.revokeObjectURL(element._currentBlobUrl)
            element._currentBlobUrl = null
        }

        const response = await cachedSecureApi.request(endpoint, {
            method: 'GET',
            responseType: 'raw',
            customCache: cacheConfig,
        })

        if (!response || !response.ok) {
            throw new Error(`[ResourceLoader] HTTP error! status: ${response?.status}`)
        }

        // СЦЕНАРІЙ 1: Запит ТЕКСТУ (наприклад, інтерактивний SVG)
        if (dataType === 'text') {
            const textData = await response.text() // Викачуємо потік вже ПІСЛЯ того, як Cache його зберіг та клонував

            if (typeof textData !== 'string') {
                throw new Error('[ResourceLoader] Expected text response, received something else')
            }

            if (textData.trim().startsWith('<svg')) {
                element.innerHTML = textData
            } else {
                element.textContent = textData
            }
            return
        }

        // СЦЕНАРІЙ 2: Запит БЛОБУ (для зображень, аудіо, відео)
        if (dataType === 'blob') {
            const blob = await response.blob() // Викачуємо потік вже ПІСЛЯ того, як Cache його зберіг та клонував

            if (!blob || !(blob instanceof Blob)) {
                throw new Error('[ResourceLoader] Response data is not a valid Blob object')
            }

            const objectURL = URL.createObjectURL(blob)
            element._currentBlobUrl = objectURL

            const tagName = element.tagName.toUpperCase()
            const mediaTags = ['IMG', 'VIDEO', 'AUDIO', 'IFRAME', 'EMBED']

            if (mediaTags.includes(tagName)) {
                element.src = objectURL
            } else if (tagName === 'A') {
                element.href = objectURL
            } else {
                element.style.backgroundImage = `url('${objectURL}')`
            }
            return
        }

        throw new Error(`[ResourceLoader] Unsupported dataType: ${dataType}`)
    } catch (error) {
        console.error(
            `[ResourceLoader] Fetch failed for [${element.tagName}] from [${endpoint}]:`,
            error,
        )

        // Фолбек при бажанні можна розкоментувати:
        // if (element.tagName.toUpperCase() === 'IMG') {
        //     element.src = fallbackUrl;
        // }
    }
}
