// // notifications/NotificationManager.js

// import EmailNotifier from './notifiers/EmailNotifier.js'
// import SMSNotifier from './notifiers/SMSNotifier.js'
// import PushNotifier from './notifiers/PushNotifier.js'

// /**
//  * NotificationManager — контекст для вибору стратегії відправки.
//  * Патерн: Strategy Context + Dependency Injection
//  */
// export default class NotificationManager {
//     /**
//      * @param {Object} deps
//      * @param {Object} deps.logger - Логер
//      * @param {Object} deps.emailConfig - Налаштування SMTP
//      */
//     constructor({ logger, emailConfig }) {
//         this.logger = logger

//         this.channels = {
//             email: new EmailNotifier({ logger, emailConfig }),
//             sms: new SMSNotifier({ logger }),
//             push: new PushNotifier({ logger }),
//         }
//     }

//     /**
//      * Відправити повідомлення через вказаний канал.
//      * @param {'email'|'sms'|'push'} channel
//      * @param {Object} notification
//      */
//     async send(channel, notification) {
//         const notifier = this.channels[channel]

//         if (!notifier) {
//             this.logger?.error(`Unknown notification channel: ${channel}`)
//             throw new Error(`Unknown notification channel: ${channel}`)
//         }

//         return notifier.send(notification)
//     }
// }

// <=========================================>

// notifications/NotificationManager.js
import { getAllChannels } from './registry/ChannelRegistry.js'

/**
 * Менеджер повідомлень.
 * Патерн: Strategy Context + Registry
 */
export default class NotificationManager {
    /**
     * Ініціалізує менеджер з усіма зареєстрованими каналами
     */
    constructor() {
        this.channels = getAllChannels()
    }

    /**
     * Відправляє повідомлення через вказаний канал
     * @param {string} channel - Назва каналу (email, sms, push)
     * @param {Object} notification - Об'єкт повідомлення
     */
    async send(channel, notification) {
        const notifier = this.channels[channel]
        if (!notifier) throw new Error(`Channel '${channel}' is not registered.`)
        return notifier.send(notification)
    }
}
