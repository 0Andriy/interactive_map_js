import { EventEmitter } from 'events'
import { IPubSub } from '../interfaces/IPubSub.js'
import { ILogger } from '../interfaces/ILogger.js'

/**
 * @class InMemoryPubSub
 * @augments IPubSub
 * @description Реалізація IPubSub для монолітного режиму (використання EventEmitter).
 */
class InMemoryPubSub extends IPubSub {
    #emitter
    #logger

    constructor(logger) {
        super()
        this.#emitter = new EventEmitter()
        this.#logger = logger
        this.#logger.log('InMemoryPubSub initialized.')
    }

    async publish(channel, message) {
        this.#logger.debug(`InMemoryPubSub: Publishing to channel '${channel}':`, message)
        this.#emitter.emit(channel, channel, message) // Емітуємо канал та повідомлення
    }

    async subscribe(channel, listener) {
        this.#logger.debug(`InMemoryPubSub: Subscribing to channel '${channel}'.`)
        // Обгортаємо listener, щоб він відповідав сигнатурі (channel, message)
        const wrappedListener = (ch, msg) => listener(ch, msg)
        this.#emitter.on(channel, wrappedListener)
        // Зберігаємо посилання на обгорнутий listener, щоб можна було коректно відписатися
        if (!this._wrappedListeners) this._wrappedListeners = new Map()
        if (!this._wrappedListeners.has(channel)) this._wrappedListeners.set(channel, new Map())
        this._wrappedListeners.get(channel).set(listener, wrappedListener)
    }

    async unsubscribe(channel, listener) {
        this.#logger.debug(`InMemoryPubSub: Unsubscribing from channel '${channel}'.`)
        const channelListeners = this._wrappedListeners?.get(channel)
        if (channelListeners) {
            const wrappedListener = channelListeners.get(listener)
            if (wrappedListener) {
                this.#emitter.removeListener(channel, wrappedListener)
                channelListeners.delete(listener)
                if (channelListeners.size === 0) {
                    this._wrappedListeners.delete(channel)
                }
            }
        }
    }

    async close() {
        this.#logger.log('InMemoryPubSub closed.')
        this.#emitter.removeAllListeners()
        this._wrappedListeners = null
    }
}

export { InMemoryPubSub }
