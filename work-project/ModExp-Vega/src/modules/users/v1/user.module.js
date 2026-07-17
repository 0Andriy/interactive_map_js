import { UserRepository } from './user.repository.js'

export class UserModule {
    /**
     * @param {Object} dbManager - Глобальний менеджер підключень до Oracle
     */
    constructor({ dbManager }) {
        this.userRepository = new UserRepository(dbManager)
    }

    /**
     * Експортуємо інтерфейс модуля.
     * Сюди ми віддаємо роутер для Express, а також сервіс/репозиторій
     * для того, щоб модуль Auth міг заінжектити їх у себе.
     */
    exports() {
        return {
            repository: this.userRepository,
        }
    }
}
