export class User {
    constructor({ id, username, email, role, createdAt }) {
        this.id = id
        this.username = username
        this.email = email
        this.role = role
        this.createdAt = createdAt
    }

    isAdmin() {
        return this.role === 'ADMIN'
    }
}
