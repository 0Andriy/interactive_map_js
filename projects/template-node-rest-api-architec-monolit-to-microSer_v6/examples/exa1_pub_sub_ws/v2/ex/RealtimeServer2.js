// src/core/RealtimeServer.js
import { Namespace } from './Namespace.js'
import { ILogger } from '../interfaces/ILogger.js'
import { WsAdapter } from '../adapters/WsAdapter.js'
import { ServiceFactory } from '../factories/ServiceFactory.js'
import { ChatNamespace } from './namespaces/ChatNamespace.js'
import { GameNamespace } from './namespaces/GameNamespace.js'

class RealtimeServer {
    #namespaces = new Map()
    #logger
    #wsAdapter
    #serviceFactory
    #namespaceClasses = {
        chat: ChatNamespace,
        game: GameNamespace,
        default: Namespace,
    }
    #authConfig = {
        chat: { requiresAuth: true },
        game: { requiresAuth: true },
        public: { requiresAuth: false },
    }
    #notificationChannel = 'global_notifications'

    constructor(logger, wsOptions, serviceFactory) {
        // ... (конструктор без змін)
        this.#logger = logger
        this.#serviceFactory = serviceFactory
        this.#wsAdapter = new WsAdapter({ noServer: true, ...wsOptions }, this.#logger)
        this.#logger.log('RealtimeServer initialized.')
    }

    async connect() {
        await this.#serviceFactory.connectAll()
        this.#logger.log('RealtimeServer connected all underlying services.')
        this.#setupGlobalNotificationListener() // <<<< НОВА ЛОГІКА ТУТ
    }

    /**
     * Запускає прослуховування каналу глобальних сповіщень.
     * Кожен інстанс підписується на цей канал і розсилає сповіщення локально.
     */
    #setupGlobalNotificationListener() {
        const pubSub = this.#serviceFactory.getPubSub()
        pubSub.subscribe(this.#notificationChannel, (channel, message) => {
            this.#logger.log(
                `[PubSub] Received global notification from channel '${channel}'. Broadcasting to all clients...`,
            )
            this.#wsAdapter.broadcast(message) // <<<< РОЗСИЛКА ВСІМ ПІДКЛЮЧЕНИМ КЛІЄНТАМ
        })
        this.#logger.log(
            `Subscribed to global notification channel: '${this.#notificationChannel}'.`,
        )
    }

    /**
     * Публікує сповіщення через Pub/Sub для розсилки всім інстансам.
     * @param {object} message - Сповіщення для розсилки (наприклад, { type: 'alert', text: '...' }).
     */
    async broadcastNotification(message) {
        const pubSub = this.#serviceFactory.getPubSub()
        await pubSub.publish(this.#notificationChannel, message)
    }

    // ... (методи listen, #validateToken, getOrCreateNamespace, #removeUserFromAllRooms, shutdown без змін)
}

export { RealtimeServer }
