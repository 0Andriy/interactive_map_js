import { Namespace } from '../core/Namespace.js'

/**
 * Namespace з гібридною авторизацією.
 * Дозволяє анонімний вхід, але обмежує певні дії.
 */
export class HybridNamespace extends Namespace {
    /**
     * @override
     * Дозволяємо підключення всім.
     */
    async authenticate(req) {
        const url = new URL(req.url, 'http://localhost')
        const token = url.searchParams.get('token')

        // Якщо токен є — валідуємо, якщо ні — заходимо як гість
        if (token) {
            try {
                // Тут ваша логіка перевірки JWT
                return { id: 'user_123', role: 'user', name: 'Ivan' }
            } catch (e) {
                this.logger.error('Invalid token, connecting as guest')
            }
        }

        return { id: `guest_${Math.random().toString(36).slice(2, 7)}`, role: 'guest' }
    }

    /**
     * @override
     * Логіка обробки повідомлень з перевіркою прав.
     */
    async onMessage(conn, raw) {
        try {
            const { action, roomName, data } = JSON.parse(raw)
            const room = this.room(roomName)

            switch (action) {
                case 'view':
                    // Публічна дія: доступна всім
                    await room.join(conn.id)
                    conn.send({ event: 'info', data: `Joined ${roomName} as ${conn.user.role}` })
                    break

                case 'chat':
                    // Приватна дія: тільки для авторизованих
                    if (conn.user.role !== 'user') {
                        return conn.send({
                            event: 'error',
                            data: 'Registration required for chatting',
                        })
                    }
                    await room.emit('message', { from: conn.user.name, text: data })
                    break

                case 'login':
                    // Upgrade: анонім стає користувачем без перепідключення
                    const user = await this._verifyToken(data.token)
                    if (user) {
                        conn.user = { ...user, role: 'user' }
                        conn.send({ event: 'auth_success', data: { name: user.name } })
                        this.logger.info(`Socket ${conn.id} upgraded to authorized user ${user.id}`)
                    }
                    break

                default:
                    conn.send({ event: 'error', data: 'Unknown action' })
            }
        } catch (e) {
            this.logger.error('Message handling error', e)
        }
    }

    /** @private */
    async _verifyToken(token) {
        // Імітація перевірки токена в БД або JWT
        if (token === 'valid_secret') return { id: 'user_123', name: 'Ivan' }
        return null
    }
}
