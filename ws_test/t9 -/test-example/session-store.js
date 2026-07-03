export class SessionStore {
    constructor() {
        this.sessions = new Map()
    }

    findSession(sessionId) {
        return this.sessions.get(sessionId)
    }

    saveSession(sessionId, sessionData) {
        this.sessions.set(sessionId, {
            ...sessionData,
            updatedAt: Date.now(),
        })
    }

    deleteSession(sessionId) {
        this.sessions.delete(sessionId)
    }
}
