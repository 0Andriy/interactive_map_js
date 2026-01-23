// src/modules/auth/subscribers/user-updated.consumer.js
export class UserUpdatedSubscriber {
    constructor(eventBus, authService) {
        eventBus.on('external.user.deleted', async (data) => {
            console.log(`User ${data.id} deleted, revoking tokens...`)
            // Логіка відклику токенів
        })
    }
}
