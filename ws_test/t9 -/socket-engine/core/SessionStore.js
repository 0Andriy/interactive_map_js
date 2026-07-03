/**
 * Сховище тимчасових сесій для відновлення після дисконекту.
 */
export class SessionStore {
    constructor() {
        /** @type {Map<string, object>} sessionId -> дані сесії */
        this.sessions = new Map()
    }

    findSession(sessionId) {
        return this.sessions.get(sessionId) ?? null
    }

    saveSession(sessionId, sessionData) {
        if (!sessionId || !sessionData) return
        this.sessions.set(sessionId, {
            ...sessionData,
            updatedAt: new Date(),
        })
    }

    deleteSession(sessionId) {
        this.sessions.delete(sessionId)
    }
}
