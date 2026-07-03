export class SessionRecovery {
    constructor(sessionStore) {
        this.sessionStore = sessionStore
    }

    backup(socket) {
        this.sessionStore.saveSession(socket.sessionId, {
            rooms: Array.from(socket.rooms),
            missedPackets: socket.missedPacketsBuffer || [],
        })
    }

    tryRecover(newSocket, handshakeSessionId) {
        if (!handshakeSessionId) return false

        const savedSession = this.sessionStore.findSession(handshakeSessionId)
        if (!savedSession) return false

        newSocket.sessionId = handshakeSessionId

        for (const room of savedSession.rooms) {
            newSocket.join(room)
        }

        for (const packet of savedSession.missedPackets) {
            newSocket.packet(packet)
        }

        savedSession.missedPackets = []
        return true
    }
}
