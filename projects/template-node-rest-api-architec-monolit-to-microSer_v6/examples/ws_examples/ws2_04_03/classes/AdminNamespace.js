import Namespace from './Namespace.js'

/**
 * Клас, що представляє простір імен для адміністративних функцій.
 */
class AdminNamespace extends Namespace {
    constructor(redisClient, chatNamespace) {
        // Передаємо посилання на інші namespace для взаємодії
        super('/admin', redisClient)
        this.chatNamespace = chatNamespace // Зберігаємо посилання на ChatNamespace
    }

    // Перевизначений метод для обробки вхідних повідомлень
    async handleMessage(ws, message) {
        try {
            const data = JSON.parse(message.toString())
            console.log(`[${this.name}] Message from Admin ${ws.username} (${ws.id}):`, data)

            switch (data.type) {
                case 'send_alert':
                    const { alertMessage } = data.payload
                    console.log(`Admin ${ws.username} sent alert: "${alertMessage}"`)
                    // Адміністратор відправляє сповіщення до чат-простору імен
                    if (this.chatNamespace) {
                        this.chatNamespace.publishToNamespace({
                            type: 'system_alert',
                            // Можна надіслати до конкретної кімнати, наприклад 'general'
                            roomId: 'general',
                            payload: { message: alertMessage, sender: ws.username },
                        })
                        ws.send(
                            JSON.stringify({
                                type: 'system',
                                message: 'Alert sent to chat namespace!',
                            }),
                        )
                    } else {
                        ws.send(
                            JSON.stringify({
                                type: 'error',
                                message: 'Chat namespace not available for alerts.',
                            }),
                        )
                    }
                    break
                case 'kick_user':
                    // Логіка для вигнання користувача (складніше, бо треба знайти сокет на будь-якому інстансі)
                    // Потрібна взаємодія з централізованим керуванням присутності
                    ws.send(
                        JSON.stringify({
                            type: 'system',
                            message: 'Kick user logic needs more implementation.',
                        }),
                    )
                    break
                default:
                    ws.send(
                        JSON.stringify({ type: 'error', message: 'Unknown admin message type.' }),
                    )
            }
        } catch (error) {
            console.error(`[${this.name}] Error parsing message from ${ws.id}:`, error)
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format.' }))
        }
    }

    // Додатковий метод для автентифікації адміністратора
    async authenticate(req) {
        const url = new URL(req.url, `http://${req.headers.host}`)
        const token = url.searchParams.get('token')
        if (token === 'SUPER_SECRET_ADMIN_TOKEN') {
            // Проста заглушка
            return {
                userId: `admin_${Math.random().toString(36).substring(2, 7)}`,
                username: `Admin_${Math.random().toString(36).substring(2, 7)}`,
            }
        }
        return null
    }
}

export default AdminNamespace
