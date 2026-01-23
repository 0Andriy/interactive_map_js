// src/modules/auth/models/auth-token.model.js
export class AuthToken {
    constructor({ id, userId, refreshToken, expiresAt }) {
        this.id = id
        this.userId = userId
        this.refreshToken = refreshToken
        this.expiresAt = expiresAt
    }
}

// src/modules/auth/models/auth-token.model.js
export class RefreshTokenEntity {
    constructor(userId, token) {
        this.userId = userId
        this.token = token
        this.createdAt = new Date()
    }
}
