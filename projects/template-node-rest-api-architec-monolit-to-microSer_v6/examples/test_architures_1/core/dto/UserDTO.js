export class UserDTO {
    static toResponse(user) {
        return {
            id: user.id,
            login: user.username,
            contact: user.email,
            isPrivileged: user.isAdmin(),
            registeredAt: user.createdAt?.toISOString(),
        }
    }
}
