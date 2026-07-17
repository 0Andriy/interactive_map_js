// ParsingClientDecorator.js
import { HttpClient } from './HttpClient.js'

export class ParsingClientDecorator extends HttpClient {
    constructor(baseClient) {
        super()

        if (!baseClient || typeof baseClient.request !== 'function') {
            throw new Error('[ParsingClientDecorator] Base client is missing or invalid')
        }

        this.client = baseClient
    }

    async request(endpoint, options = {}) {
        const responseType = options.responseType || 'raw'
        const response = await this.client.request(endpoint, options)

        if (!response) {
            throw new Error('[ParsingClientDecorator] Received empty response object from network')
        }

        // Якщо тип 'raw', повертаємо чистий Response як є (навіть якщо там помилка 4xx/5xx)
        if (responseType === 'raw') {
            return response
        }

        // Якщо сервер повернув HTTP помилку, намагаємось витягти її деталі
        if (!response.ok) {
            let serverErrorDetails = ''
            try {
                // Навіть при помилці намагаємось прочитати текст або JSON від сервера
                serverErrorDetails = await response.text()
            } catch (_) {
                serverErrorDetails = 'No error body available'
            }
            throw new Error(
                `[ParsingClientDecorator] HTTP error! status: ${response.status}. Details: ${serverErrorDetails}`,
            )
        }

        return await this._parseResponse(response, responseType)
    }

    async _parseResponse(response, responseType) {
        if (responseType === 'raw') return response

        // Перевіряємо, чи є взагалі тіло відповіді (захист від SyntaxError)
        const contentLength =
            typeof response.headers?.get === 'function'
                ? response.headers.get('content-length')
                : null

        if (contentLength === '0' || response.status === 204) {
            return null
        }

        if (responseType === 'auto') {
            const contentType =
                typeof response.headers?.get === 'function'
                    ? response.headers.get('content-type') || ''
                    : ''

            if (contentType.includes('application/json')) {
                responseType = 'json'
            } else if (contentType.includes('text/')) {
                responseType = 'text'
            } else {
                return response // Якщо тип бінарний або невідомий, повертаємо як є
            }
        }

        try {
            switch (responseType) {
                case 'json':
                    return await response.json()
                case 'text':
                    return await response.text()
                case 'blob':
                    return await response.blob()
                case 'arrayBuffer':
                    return await response.arrayBuffer()
                case 'formData':
                    return await response.formData()
                default:
                    return response
            }
        } catch (error) {
            console.error(
                `[ParsingClientDecorator] Failed to parse response as ${responseType}`,
                error,
            )
            return null // Повертаємо null замість крашу програми
        }
    }
}
