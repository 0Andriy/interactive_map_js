// notifications/notifiers/SMSNotifier.js

import IBaseNotifier from './IBaseNotifier.js'
import { renderTemplatePart } from '../templates/renderTemplate.js'

/**
 * Мок реалізації SMS.
 * Патерн: Strategy Implementation
 */
export default class SMSNotifier extends IBaseNotifier {
    /**
     * @param {Object} deps
     * @param {Object} deps.logger - Логер
     */
    constructor({ logger }) {
        super({ logger })
    }

    /**
     * Відправляє SMS
     * @param {Object} notification
     * @param {string} notification.to
     * @param {string} [notification.template]
     * @param {Object} [notification.data]
     * @param {string} [notification.body]
     */
    async send({ to, template, data, body }) {
        const content = template ? await renderTemplatePart('sms', template, 'body', data) : body
        this.logger?.info(`[MOCK SMS] Sending to ${to}: ${content}`)
    }
}
