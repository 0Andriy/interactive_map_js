import { XMLParser } from 'fast-xml-parser'

export class HttpClient {
    constructor(baseUrl, defaultOptions = {}) {
        if (!baseUrl) throw new Error('[HttpClient]: baseUrl is required')

        this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
        this.defaultOptions = defaultOptions

        this.xmlParser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '',
            ignoreDeclaration: true,
            trimValues: true,
            allowBooleanAttributes: true,
            parseTagValue: true,
            processEntities: false, //true
            htmlEntities: false, //true
        })
    }

    async #request(endpoint, options = {}) {
        const mergedOptions = { ...this.defaultOptions, ...options }

        const {
            method = 'GET',
            query,
            body,
            headers = {},
            responseType = 'auto',
            timeout = 10000, // 10 секунд за замовчуванням
            signal: externalSignal,
        } = mergedOptions

        // Формуємо URL: прибираємо початковий слеш в endpoint, якщо він є
        const url = new URL(endpoint.replace(/^\//, ''), this.baseUrl)

        if (query) {
            Object.entries(query).forEach(([key, value]) => {
                if (value !== undefined) url.searchParams.append(key, value)
            })
        }

        // Керування скасуванням запиту (AbortController)
        const controller = new AbortController()
        const { signal } = controller

        if (externalSignal) {
            if (externalSignal.aborted) controller.abort()
            externalSignal.addEventListener('abort', () => controller.abort())
        }

        let timeoutId = null
        if (timeout) {
            timeoutId = setTimeout(() => controller.abort(), timeout)
        }

        const config = {
            method,
            headers: { ...headers },
            signal,
        }

        // Обробка тіла запиту
        if (body) {
            if (typeof body === 'object' && !(body instanceof Buffer)) {
                config.headers['Content-Type'] = 'application/json'
                config.body = JSON.stringify(body)
            } else {
                config.body = body
            }
        }

        const fullUrl = url.toString()

        try {
            const response = await fetch(fullUrl, config)
            if (timeoutId) clearTimeout(timeoutId)

            if (!response.ok) {
                const errorText = await response.text()
                const error = new Error(
                    `External API Error [${response.status}]: ${response.statusText}`,
                )
                error.status = response.status
                error.data = errorText
                throw error
            }

            return await this.#parseResponse(response, responseType)
        } catch (error) {
            if (timeoutId) clearTimeout(timeoutId)

            if (error.name === 'AbortError') {
                if (externalSignal?.aborted) {
                    throw new Error('Request cancelled by user')
                }
                throw new Error(`Request timeout: ${timeout}ms`)
            }
            throw error
        }
    }

    async #parseResponse(response, responseType) {
        const contentType = response.headers.get('content-type') || ''

        // 1. Якщо примусово просять Buffer АБО це бінарний тип контенту
        if (
            responseType === 'buffer' ||
            (responseType === 'auto' &&
                (contentType.includes('octet-stream') || contentType.includes('zip')))
        ) {
            const arrayBuffer = await response.arrayBuffer()
            return Buffer.from(arrayBuffer)
        }

        // 2. Якщо примусово просять XML АБО це XML за заголовком
        if (responseType === 'xml' || (responseType === 'auto' && contentType.includes('xml'))) {
            return this.#parseXml(response)
        }

        // 3. Якщо примусово просять JSON АБО це JSON за заголовком
        if (
            responseType === 'json' ||
            (responseType === 'auto' && contentType.includes('application/json'))
        ) {
            // Перевірка на випадок порожнього тіла при примусовому json
            const text = await response.text()
            return text ? JSON.parse(text) : null
        }

        // 4. Якщо примусово просять текст
        if (responseType === 'text') {
            return response.text()
        }

        // 5. Дефолтна поведінка (якщо responseType === 'auto' і нічого не підійшло)
        return response.text()
    }

    async #parseXml(response) {
        const buffer = await response.arrayBuffer()
        if (buffer.byteLength === 0) throw new Error('Empty XML response')

        // Визначаємо кодування
        const head = new TextDecoder('ascii').decode(buffer.slice(0, 400))
        const match = head.match(/encoding\s*=\s*["']?([\w-]+)["']?/i)
        let encoding = match?.[1]?.toLowerCase() || 'utf-8'

        // Мапінг: якщо прийшов KOI8-R, примусово читаємо як KOI8-U, щоб були українські літери
        if (encoding.startsWith('koi8') || encoding === 'koi8-r' || encoding === 'koi8-u') {
            encoding = 'koi8-u'
        }

        try {
            const xmlString = new TextDecoder(encoding).decode(buffer)
            return this.xmlParser.parse(xmlString)
        } catch (error) {
            throw new Error(`Failed to parse XML: ${error.message}`)
        }
    }

    // Публічні методи API
    async get(url, options) {
        return this.#request(url, { ...options, method: 'GET' })
    }

    async post(url, body, options) {
        return this.#request(url, { ...options, method: 'POST', body })
    }

    async put(url, body, options) {
        return this.#request(url, { ...options, method: 'PUT', body })
    }

    async delete(url, options) {
        return this.#request(url, { ...options, method: 'DELETE' })
    }

    async getBuffer(url, options) {
        return this.#request(url, { ...options, method: 'GET', responseType: 'buffer' })
    }
}
