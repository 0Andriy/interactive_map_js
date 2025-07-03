// example.js

import NotifierFactory from './factory/NotifierFactory.js'
import NotificationManager from './NotificationManager.js'
import { registerChannel } from './registry/ChannelRegistry.js'
import winston from 'winston'

// Ініціалізація логера
const logger = winston.createLogger({
    transports: [new winston.transports.Console()],
})

// Конфіг для email (nodemailer)
const emailConfig = {
    host: 'smtp.mailtrap.io',
    port: 2525,
    auth: {
        user: 'your_user',
        pass: 'your_pass',
    },
}

// Створюємо фабрику з DI
const factory = new NotifierFactory({ logger, emailConfig })

// Створюємо інстанси каналів через фабрику
const channels = factory.createAll()

// Реєструємо канали у реєстрі
for (const [name, notifier] of Object.entries(channels)) {
    registerChannel(name, () => notifier)
}

// Створюємо менеджер повідомлень
const notifier = new NotificationManager()

// Приклад використання
;(async () => {
    await notifier.send('email', {
        to: 'user@example.com',
        // Якщо є шаблон - subject, body, html будуть автоматично сгенеровані
        template: 'welcome',
        data: { userName: 'Andriy' },
    })

    await notifier.send('sms', {
        to: '+380991234567',
        template: 'code',
        data: { code: '1234' },
    })

    await notifier.send('push', {
        to: 'device-token-abc123',
        template: 'alert',
        data: { message: 'New message!' },
    })
})()
