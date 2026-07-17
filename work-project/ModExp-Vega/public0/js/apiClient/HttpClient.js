// HttpClient.js
export class HttpClient {
    async request(endpoint, options = {}) {
        throw new Error('[HttpClient] Method "request" must be implemented')
    }

    get(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'GET' })
    }

    post(endpoint, body = null, options = {}) {
        const requestOptions = { ...options, method: 'POST' }
        if (body !== null) requestOptions.body = body
        return this.request(endpoint, requestOptions)
    }

    put(endpoint, body = null, options = {}) {
        const requestOptions = { ...options, method: 'PUT' }
        if (body !== null) requestOptions.body = body
        return this.request(endpoint, requestOptions)
    }

    delete(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'DELETE' })
    }
}
