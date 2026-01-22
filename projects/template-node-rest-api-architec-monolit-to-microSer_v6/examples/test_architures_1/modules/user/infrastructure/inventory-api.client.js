// src/modules/users/infrastructure/inventory-api.client.js
export class InventoryClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl
    }

    async getProductStock(productId) {
        const response = await fetch(`${this.baseUrl}/products/${productId}`)
        if (!response.ok) throw new Error('Microservice unavailable')
        return await response.json() // Повертає дані з іншого сервісу
    }
}
