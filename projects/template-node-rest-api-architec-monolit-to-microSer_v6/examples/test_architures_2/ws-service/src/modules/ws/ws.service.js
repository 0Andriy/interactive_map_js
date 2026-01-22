// src/modules/ws/ws.service.js
export class WSService {
    constructor(io, rabbitMQ) {
        this.io = io
        this.rabbitMQ = rabbitMQ
    }

    async listenToGlobalEvents() {
        // Слухаємо подію "user_logged_in" від auth-service
        await this.rabbitMQ.listen('user_notifications', (data) => {
            const { userId, message } = data

            // Надсилаємо повідомлення конкретному користувачу в його кімнату
            this.io.to(`user:${userId}`).emit('notification', {
                text: message,
                timestamp: new Date(),
            })
        })
    }
}
