import { Namespace } from '../core/Namespace.js'

/**
 * ChatNamespace: Реалізація чат-кімнат з простою логікою повідомлень.
 */
export class ChatNamespace extends Namespace {
    /** @override */
    async authenticate(req) {
        const token = new URL(req.url, 'http://localhost').searchParams.get('token')
        // Повертаємо об'єкт користувача або null
        return token ? { userId: '123', name: 'Developer' } : null
    }

    /** @override */
    async onMessage(conn, raw) {
        try {
            const { action, room: roomName, text } = JSON.parse(raw)
            const room = this.room(roomName)

            if (action === 'join') await room.join(conn.id)
            if (action === 'msg') {
                // Безпечна перевірка членства
                const isMember = await this.state.isMember(this.name, roomName, conn.id)
                if (!isMember) return conn.send({ event: 'err', data: 'Join room first' })

                await room.emit('msg', {
                    sender: conn.user?.name || `Guest_${conn.id.slice(0, 4)}`,
                    text,
                })
            }
        } catch (e) {
            this.logger.error('Message processing error', e)
        }
    }
}
