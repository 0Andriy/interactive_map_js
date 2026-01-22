export class StatsApiClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl
    }

    async getUserBonuses(userId) {
        try {
            // У 2026 fetch вбудований у Node.js
            const response = await fetch(`${this.baseUrl}/bonuses/${userId}`)
            if (!response.ok) return 0
            const data = await response.json()
            return data.points
        } catch (e) {
            return 0 // Fallback якщо мікросервіс лежить
        }
    }
}
