// src/di/PubSubAdapter.js

/**
 * @typedef {function(string, any): void} ListenerFunction
 */
export class PubSubAdapter {
    constructor() {
        if (new.target === PubSubAdapter) {
            throw new TypeError('Cannot construct PubSubAdapter instances directly')
        }
    }

    /**
     * @param {string} channel
     * @param {string} message
     * @returns {Promise<void>}
     */
    async publish(channel, message) {
        throw new Error("Method 'publish' must be implemented.")
    }

    /**
     * @param {string} channel
     * @param {ListenerFunction} listener
     * @returns {Promise<void>}
     */
    async subscribe(channel, listener) {
        throw new Error("Method 'subscribe' must be implemented.")
    }

    /**
     * @param {string} channel
     * @param {ListenerFunction} listener
     * @returns {Promise<void>}
     */
    async unsubscribe(channel, listener) {
        throw new Error("Method 'unsubscribe' must be implemented.")
    }
}
