// notifications/notifiers/EmailNotifier.js

import nodemailer from 'nodemailer'
import IBaseNotifier from './IBaseNotifier.js'
import { renderTemplatePart } from '../templates/renderTemplate.js'

/**
 * Повідомлювач для надсилання Email через nodemailer.
 * Патерн: Strategy Implementation
 */
export default class EmailNotifier extends IBaseNotifier {
    /**
     * @param {Object} deps
     * @param {Object} deps.logger - Логер
     * @param {Object} deps.emailConfig - Конфіг для nodemailer
     * @param {string} deps.defaultFrom - Адреса відправника за замовчуванням
     */
    constructor({ logger, emailConfig, defaultFrom }) {
        super({ logger })
        this.transporter = nodemailer.createTransport(emailConfig)
        this.defaultFrom = defaultFrom
    }

    /**
     * Відправляє email-повідомлення (підтримує шаблон subject, body, html).
     * @param {Object} notification
     * @param {string} notification.to
     * @param {string} [notification.subject]
     * @param {string} [notification.template]
     * @param {Object} [notification.data]
     * @param {string} [notification.body]
     * @param {string} [notification.html]
     */
    async send({ to, subject, template, data, body, html }) {
        try {
            const textBody = template
                ? await renderTemplatePart('email', template, 'body', data)
                : body
            const htmlBody = template
                ? await renderTemplatePart('email', template, 'html', data)
                : html
            const subjectText =
                template && !subject
                    ? await renderTemplatePart('email', template, 'subject', data)
                    : subject

            const result = await this.transporter.sendMail({
                from: 'no-reply@example.com',
                to,
                subject: subjectText,
                text: textBody,
                html: htmlBody,
            })

            this.logger?.info(`Email sent to ${to}: ${result.messageId}`)
        } catch (err) {
            this.logger?.error(`Email failed to ${to}: ${err.message}`)
            throw err
        }
    }

    /**
     * Відправити email
     * @param {Object} notification
     * @param {string} notification.to - Email отримувача
     * @param {string} [notification.from] - Email відправника (перевизначає defaultFrom)
     * @param {string} [notification.subject] - Тема листа
     * @param {string} [notification.template] - Назва шаблону
     * @param {Object} [notification.data] - Дані для шаблону
     * @param {string} [notification.body] - Альтернатива до шаблону (текст)
     * @param {string} [notification.html] - HTML-версія листа (якщо є)
     */
    async send({ to, from, subject, template, data, body, html }) {
        try {
            let finalSubject = subject
            let textBody = body
            let htmlBody = html

            if (template) {
                const {
                    subject: tplSubject,
                    text,
                    html,
                } = await renderTemplate('email', template, data)
                finalSubject = finalSubject || tplSubject
                textBody = textBody || text
                htmlBody = htmlBody || html
            }

            const result = await this.transporter.sendMail({
                from: from || this.defaultFrom,
                to,
                subject: finalSubject,
                text: textBody,
                html: htmlBody,
            })

            this.logger?.info(`Email sent to ${to}: ${result.messageId}`)
        } catch (err) {
            this.logger?.error(`Email failed to ${to}: ${err.message}`)
            throw err
        }
    }
}
