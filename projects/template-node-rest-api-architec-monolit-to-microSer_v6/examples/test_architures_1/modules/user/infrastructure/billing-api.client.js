// src/modules/users/infrastructure/billing-api.client.js
export class BillingApiClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl
    }

    async getBalance(userId) {
        const response = await fetch(`${this.baseUrl}/balance/${userId}`)
        if (!response.ok) return 0
        return (await response.json()).balance
    }
}
