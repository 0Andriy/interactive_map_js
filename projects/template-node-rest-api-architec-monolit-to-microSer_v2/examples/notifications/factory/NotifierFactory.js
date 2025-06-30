// notifications/factory/NotifierFactory.js

import EmailNotifier from '../notifiers/EmailNotifier.js'
import SMSNotifier from '../notifiers/SMSNotifier.js'
import PushNotifier from '../notifiers/PushNotifier.js'

/**
 * Проста фабрика для створення notifiers із DI контейнера
 */
export default class NotifierFactory {
    /**
     * @param {Object} deps
     * @param {Object} deps.logger
     * @param {Object} deps.emailConfig
     */
    constructor({ logger, emailConfig }) {
        this.logger = logger
        this.emailConfig = emailConfig
    }

    /**
     * Створює всі відомі notifiers
     * @returns {Object<string, BaseNotifier>}
     */
    createAll() {
        return {
            email: new EmailNotifier({ logger: this.logger, emailConfig: this.emailConfig }),
            sms: new SMSNotifier({ logger: this.logger }),
            push: new PushNotifier({ logger: this.logger }),
        }
    }
}
