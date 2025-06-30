// notifications/notifiers/PushNotifier.js

import IBaseNotifier from './IBaseNotifier.js'
import { renderTemplatePart } from '../templates/renderTemplate.js'

/**
 * Мок реалізації Push.
 * Патерн: Strategy Implementation
 */
export default class PushNotifier extends IBaseNotifier {
    /**
     * @param {Object} deps
     * @param {Object} deps.logger - Логер
     */
    constructor({ logger }) {
        super({ logger })
    }

    /**
     * Відправляє Push
     * @param {Object} notification
     * @param {string} notification.to
     * @param {string} [notification.template]
     * @param {Object} [notification.data]
     * @param {string} [notification.body]
     */
    async send({ to, template, data, body }) {
        const content = template ? await renderTemplatePart('push', template, 'body', data) : body
        this.logger?.info(`[MOCK PUSH] Sending to ${to}: ${content}`)
    }
}
