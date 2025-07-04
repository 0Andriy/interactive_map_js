// src/services/email.service.js
import nodemailer from 'nodemailer'

class EmailService {
    /**
     * Надсилає email.
     * @param {string} to - Отримувач email.
     * @param {string} subject - Тема email.
     * @param {string} text - Текстовий вміст email.
     * @param {string} html - HTML-вміст email.
     * @returns {Promise<object>} Інформація про відправку листа.
     */
    async sendEmail(to, subject, text, html) {
        try {
            const info = await transporter.sendMail({
                from: `"Your Service" <${process.env.EMAIL_FROM}>`, // Адреса відправника
                to: to,
                subject: subject,
                text: text,
                html: html,
            })
            emailServiceLogger.info(`Email sent to ${to}: ${info.messageId}`)
            return info
        } catch (error) {
            emailServiceLogger.error(`Failed to send email to ${to}: ${error.message}`, { error })
            throw new Error(`Failed to send email: ${error.message}`)
        }
    }

    /**
     * Надсилає email для скидання пароля.
     * @param {string} toEmail - Email користувача.
     * @param {string} username - Ім'я користувача.
     * @param {string} resetLink - Посилання для скидання пароля.
     * @returns {Promise<object>}
     */
    async sendPasswordResetEmail(toEmail, username, resetLink) {
        const subject = 'Password Reset Request'
        const text = `Hi ${username},\n\nYou requested a password reset. Please click on the following link to reset your password: ${resetLink}\n\nThis link will expire in 1 hour.\n\nIf you did not request this, please ignore this email.`
        const html = `<p>Hi <b><span class="math-inline">\{username\}</b\>,</p\>
            <p>You requested a password reset. Please click on the following link to reset your password:</p>
            <p><a href="{resetLink}">Reset your password</a></p>
            <p>This link will expire in 1 hour.</p>
            <p>If you did not request this, please ignore this email.</p>
        `

        return this.sendEmail(toEmail, subject, text, html)
    }

    /**
     * Надсилає email для активації облікового запису.
     * @param {string} toEmail - Email користувача.
     * @param {string} username - Ім'я користувача.
     * @param {string} activationLink - Посилання для активації облікового запису.
     * @returns {Promise<object>}
     */
    async sendActivationEmail(toEmail, username, activationLink) {
        const subject = 'Activate Your Account'
        const text = `Welcome ${username}!\n\nPlease click on the following link to activate your account: ${activationLink}\n\nThis link will expire in 24 hours.`
        const html = `<p>Welcome <b><span class="math-inline">\{username\}</b\>\!</p\>
            <p>Thank you for registering. Please click on the following link to activate your account:</p>
            <p><a href="{activationLink}">Activate your account</a></p>
            <p>This link will expire in 24 hours.</p>
        `

        return this.sendEmail(toEmail, subject, text, html)
    }
}

export default new EmailService()
