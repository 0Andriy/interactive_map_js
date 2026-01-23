// modules/auth/providers/user-db.provider.js (Поточний варіант)
export class UserDbProvider {
    constructor(usersService) {
        this.usersService = usersService
    }

    async findByEmail(email) {
        return this.usersService.getByEmail(email)
    }
}

// modules/auth/providers/user-http.provider.js (Майбутній варіант для мікросервісів)
export class UserHttpProvider {
    async findByEmail(email) {
        const response = await fetch(`http://users-service/internal/users?email=${email}`)
        return response.json()
    }
}

// src/modules/auth/providers/user.provider.js
export class UserProvider {
    constructor(httpClient) {
        // httpClient може бути axios або іншим сервісом
        this.httpClient = httpClient
    }

    async findUserById(id) {
        // Тут ми інкапсулюємо логіку запиту до іншого мікросервісу
        const response = await this.httpClient.get(`/internal/users/${id}`)
        return {
            id: response.data.uuid,
            email: response.data.user_email,
            role: response.data.permissions,
        }
    }
}
