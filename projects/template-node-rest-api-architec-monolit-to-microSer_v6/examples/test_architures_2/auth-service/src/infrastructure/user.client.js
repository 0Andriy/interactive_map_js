import axios from 'axios'

export class UserClient {
    constructor(baseUrl) {
        this.http = axios.create({ baseURL: baseUrl })
    }

    async findByEmail(email) {
        // Запит до внутрішнього API user-service
        const { data } = await this.http.get(`/internal/users`, { params: { email } })
        return data
    }
}
