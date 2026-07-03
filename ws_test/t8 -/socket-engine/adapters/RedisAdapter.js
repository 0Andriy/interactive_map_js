import { InMemoryAdapter } from './InMemoryAdapter.js'

/**
 * Асихронний масштабований RedisAdapter.
 * Реалізує міжсерверну комунікацію для кластерів Node.js через Redis Pub/Sub.
 */
export class RedisAdapter extends InMemoryAdapter {
    /**
     * @param {object} nsp - Простір імен.
     * @param {object} pubClient - Екземпляр ioredis для публікації (Publish).
     * @param {object} subClient - Екземпляр ioredis для підписки (Subscribe).
     * @param {object} [options={}] - Додаткові опції адаптера.
     * @param {string} [options.key='socket.io'] - Префікс для каналів Redis.
     */
    constructor(nsp, pubClient, subClient, options = {}) {
        super(nsp)

        this.pubClient = pubClient
        this.subClient = subClient
        this.channelKey = `${options.key ?? 'socket.io'}#${nsp.name || '/'}#`
        this.uid = Math.random().toString(36).substring(2, 15) // Унікальний ID поточного Node-сервера

        this._setupRedisSubscription().catch((err) => {
            if (typeof this.nsp._handleError === 'function') {
                this.nsp._handleError('redis_init', err)
            }
        })
    }

    /**
     * Налаштовує підписку на системний канал простору імен в Redis.
     * @private
     */
    async _setupRedisSubscription() {
        if (!this.subClient || typeof this.subClient.subscribe !== 'function') return

        // Кожен інстанс слухає загальний канал для свого Namespace
        await this.subClient.subscribe(this.channelKey)

        this.subClient.on('message', (channel, message) => {
            if (channel !== this.channelKey) return

            try {
                const { uid, packet, opts } = JSON.parse(message)

                // ЗАХИСТ: якщо повідомлення прийшло від нас самих — ігноруємо,
                // ми його вже локально відправили в методі broadcast()
                if (uid === this.uid) return

                // Відновлюємо структури Set після JSON-серіалізації
                const restoredOpts = {
                    rooms: new Set(opts.rooms),
                    except: new Set(opts.except),
                    flags: opts.flags,
                }

                // Викликаємо локальний бродкаст InMemoryAdapter для сокетів, які висять на цьому інстансі
                super.broadcast(packet, restoredOpts)
            } catch (error) {
                if (typeof this.nsp._handleError === 'function') {
                    this.nsp._handleError('redis_message_parse', error)
                }
            }
        })
    }

    /**
     * Публікує пакет у Redis для розсилки по всьому кластеру серверів,
     * та одночасно виконує миттєву локальну відправку.
     * @override
     */
    async broadcast(packet, opts) {
        if (!packet || !opts) return

        // 1. Спочатку робимо моментальну відправку для сокетів на цьому ж сервері
        await super.broadcast(packet, opts)

        const flags = opts.flags || {}

        // НЮАНС SOCKET.IO: якщо виставлено прапорець .local,
        // повідомлення заборонено слати в Redis, воно лишається тільки тут
        if (flags.local) return

        // 2. Публікуємо в Redis для інших серверів кластера
        if (this.pubClient && typeof this.pubClient.publish === 'function') {
            const message = JSON.stringify({
                uid: this.uid,
                packet,
                opts: {
                    rooms: opts.rooms ? [...opts.rooms] : [], // JSON не вміє в Set, перетворюємо в масиви
                    except: opts.except ? [...opts.except] : [],
                    flags: flags,
                },
            })

            await this.pubClient.publish(this.channelKey, message)
        }
    }
}
