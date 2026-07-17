import { HttpClient } from './ios.client.js'
import { IosService } from './ios.service.js'
import { IosController } from './ios.controller.js'
import { IosRouter } from './ios.router.js'
import { setupExternalApiSocket } from './ios.ws.js'
import { CustomError } from '../../../common/utils/CustomError.js'

export class IosModule {
    /**
     * @param {Object} dependencies
     * @param {Object} dependencies.authGuard - Екземпляр класу AuthGuard для захисту API
     * @param {Object|null} dependencies.wss - Екземпляр WebSocket сервера (для Real-time оновлень)
     */
    constructor({ authGuard, wss = null, logger = null }) {
        // 1. Конфігурація та валідація середовища
        const BASE_URL = process.env.EXTERNAL_IOS_API_URL

        if (!BASE_URL) {
            throw new CustomError(
                'EXTERNAL_IOS_API_URL не визначено. Будь ласка, додайте посилання на стороннє API у файл .env',
                500,
                { sysCode: 'CONFIG_ERROR' },
            )
        }

        this.logger = logger?.child?.({ component: 'IosModule' }) ?? logger

        // 2. Створюємо низькорівневий універсальний HTTP-клієнт
        this.httpClient = new HttpClient(BASE_URL)

        // 3. Ініціалізуємо бізнес-сервіс модуля
        this.service = new IosService(this.httpClient)

        // 4. Збираємо HTTP шар модуля (Контролер та Роутер)
        this.controller = new IosController(this.service)

        // Передаємо контролер та authGuard в клас роутера
        this.router = new IosRouter(this.controller, authGuard)

        // 5. Ініціалізація WebSocket транспорту, якщо він переданий в систему
        if (wss) {
            setupExternalApiSocket(wss, this.service, authGuard, this.logger)
        }
    }

    /**
     * Експортуємо публічний інтерфейс модуля для Express додатка
     */
    exports() {
        return {
            router: this.router.getRouter(),
            controller: this.controller,
            service: this.service,
        }
    }
}
