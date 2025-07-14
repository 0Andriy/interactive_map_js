/**
 * @interface IPubSub
 * @description Інтерфейс для системи Pub/Sub.
 */
class IPubSub {
    async publish(channel, message) {
        throw new Error("Method 'publish()' must be implemented.")
    }
    async subscribe(channel, listener) {
        throw new Error("Method 'subscribe()' must be implemented.")
    }
    async unsubscribe(channel, listener) {
        throw new Error("Method 'unsubscribe()' must be implemented.")
    }
    async close() {
        throw new Error("Method 'close()' must be implemented.")
    }
}

export { IPubSub }
