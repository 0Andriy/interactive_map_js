// import multer from 'multer'
import EventEmitter from 'events'
import { HttpClient } from './ios.client.js'
import { IosService } from './ios.service.js'
import { IosController } from './ios.controller.js'
import { createIosRouter } from './ios.router.js'
import { setupExternalApiSocket } from './ios.ws.js'

/**
 * @param {Object} options
 * @param {Object} options.wss - Екземпляр WebSocket сервера (для Real-time оновлень) може замінити на eventBus (шину)
 */
export const initIosModule = ({ wss = null, globalEvents = null } = {}) => {
    // 0. Конфігурація (краще брати з process.env для безпеки)
    const BASE_URL = process.env.EXTERNAL_IOS_API_URL

    if (!BASE_URL) {
        throw new Error(
            '[Config Error]: EXTERNAL_IOS_API_URL не визначено. ' +
                'Будь ласка, додайте посилання на стороннє API у файл .env',
        )
    }

    // // 1. Ініціалізація Multer для завантаження файлів (в пам'ять, щоб прокинути далі)
    // // const storage = multer.memoryStorage()
    // const upload = null //multer({ storage })

    // // Створюємо локальну шину подій для цього модуля
    // const eventEmitter = new EventEmitter()

    // 2. Створюємо низькорівневий клієнт для HTTP запитів
    // Ми передаємо URL, щоб клієнт був універсальним
    const httpClient = new HttpClient(BASE_URL)

    // 3. Створюємо Сервіс (Бізнес-логіка)
    // Впорскуємо клієнт та сокети. Тепер сервіс може робити запити
    // і відправляти повідомлення в браузер при отриманні даних.
    const service = new IosService(httpClient)

    // 4. Створюємо Контролер (Обробка HTTP запитів)
    // Впорскуємо сервіс. Контролер знає тільки про нього.
    const controller = new IosController(service)

    // 5. Створюємо Роутер
    // Передаємо контролер та налаштований multer для обробки завантажень
    const router = createIosRouter(controller)

    //
    if (wss) {
        setupExternalApiSocket(wss, service, console)
    }

    // // --- ПЕРЕДАЧА ДАНИХ НАЗОНІ ---

    // // 1. Для Вебсокетів (Real-time фронтенд)
    // eventEmitter.on('data_processed', (data) => {
    //     if (wss) {
    //         const msg = JSON.stringify({ event: 'IOS_SYNC', data })
    //         wss.clients.forEach((c) => c.readyState === 1 && c.send(msg))
    //     }
    // })

    // // 2. Для Логування або Аналітики (приклад)
    // eventEmitter.on('data_processed', (data) => {
    //     console.log(`[Audit]: Нові дані оброблено для ID: ${data.id}`)
    // })

    // // Реалізація WebSocket-трансляції через слухання шини подій
    // if (globalEvents && wss) {
    //     globalEvents.on('ios:data_synced', (data) => {
    //         const payload = JSON.stringify({ event: 'IOS_UPDATE', data })
    //         wss.clients.forEach((c) => c.readyState === 1 && c.send(payload))
    //     })
    // }

    // Повертаємо об'єкт модуля для гнучкого використання в системі
    return {
        router,
        controller,
        service,
        // events: eventEmitter,
    }
}
