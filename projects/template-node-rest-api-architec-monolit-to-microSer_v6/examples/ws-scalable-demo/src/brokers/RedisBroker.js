// src/brokers/RedisBroker.js
import IMessageBroker from './IMessageBroker.js'
import { createClient } from 'redis'

/**
 * Брокер, що використовує Redis Pub/Sub для масштабування між серверами.
 */
export default class RedisBroker extends IMessageBroker {
    constructor(messageHandlerCallback) {
        super()
        // Callback-функція менеджера, яка буде обробляти вхідні повідомлення
        this.handleMessage = messageHandlerCallback

        this.pub = createClient()
        this.sub = createClient()
        this.pub.connect()
        this.sub.connect()

        this.sub.on('error', (err) => console.error('Redis Subscriber Error:', err))
        this.pub.on('error', (err) => console.error('Redis Publisher Error:', err))

        console.log('Використовується Redis Broker (максимальна ефективність)')
    }

    // Підписка на конкретний канал (кімнату)
    subscribe(channel) {
        // Ми підписуємося на канал в Redis і прив'язуємо наш загальний обробник
        this.sub.subscribe(channel, (message, channel) => {
            this.handleMessage(channel, message)
        })
        console.log(`[RedisBroker] Підписано на канал Redis: ${channel}`)
    }

    // Відписка від каналу (коли кімната стає порожньою на цьому сервері)
    unsubscribe(channel) {
        this.sub.unsubscribe(channel)
        console.log(`[RedisBroker] Відписано від каналу Redis: ${channel}`)
    }

    // Публікація повідомлення в канал (кімнату)
    publish(channel, message) {
        this.pub.publish(channel, message)
    }
}
