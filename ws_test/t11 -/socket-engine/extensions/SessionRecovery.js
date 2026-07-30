export class SessionRecovery {
    static sessions = new Map()

    static attach(socket, opts = {}) {
        const sessionTimeout = opts.timeout || 120000

        if (socket.handshake.isRecovered && socket.handshake.savedSession) {
            const saved = socket.handshake.savedSession
            if (saved.timer) clearTimeout(saved.timer)

            // ♻️ Відновлюємо групові кімнати
            for (const room of saved.rooms) {
                if (room !== saved.oldSocketId) {
                    socket.join(room)
                }
            }

            // 🎯 Створюємо Alias-кімнату для старого socketId, щоб повідомлення адресовані io.to(oldSocketId)
            // безшовно прилітали на новий socket.id без повідомлення третіх сторін!
            socket.join(saved.oldSocketId)

            // Досилаємо чергу
            for (const packet of saved.missedEvents) {
                socket.sendRaw(packet)
            }
            saved.missedEvents = []

            socket.emit('_session_recovered', { sessionId: socket.sessionId, socketId: socket.id })
        } else {
            // При першому успішному вході віддаємо таємний sessionId
            socket.emit('_session_created', { sessionId: socket.sessionId, socketId: socket.id })
        }

        const originalSendRaw = socket.sendRaw.bind(socket)
        socket.sendRaw = (stringData) => {
            const currentSession = SessionRecovery.sessions.get(socket.sessionId)
            if (currentSession && socket.ws.readyState !== socket.ws.OPEN) {
                currentSession.missedEvents.push(stringData)
                return
            }
            originalSendRaw(stringData)
        }

        // Хук відключення сокета
        socket.on('disconnecting', (reason, code) => {
            const sessionData = {
                sessionId: socket.sessionId,
                oldSocketId: socket.id,
                rooms: Array.from(socket.rooms),
                user: socket.user,
                missedEvents: SessionRecovery.sessions.get(socket.sessionId)?.missedEvents || [],
                timer: null,
            }

            sessionData.timer = setTimeout(() => {
                SessionRecovery.sessions.delete(socket.sessionId)
                console.log(
                    `[SessionRecovery] Секретна сесія ${socket.sessionId} остаточно видалена.`,
                )
            }, sessionTimeout)

            // Ключ мапи — Тільки таємний sessionId!
            SessionRecovery.sessions.set(socket.sessionId, sessionData)
        })
    }

    static handleMiddleware() {
        return async (ctx, next) => {
            const { handshake } = ctx
            const clientSessionId = handshake.query.sessionId

            if (clientSessionId && SessionRecovery.sessions.has(clientSessionId)) {
                const saved = SessionRecovery.sessions.get(clientSessionId)
                handshake.recoveredSessionId = clientSessionId
                handshake.isRecovered = true
                handshake.savedSession = saved
                handshake.user = saved.user
            }

            next()
        }
    }
}
