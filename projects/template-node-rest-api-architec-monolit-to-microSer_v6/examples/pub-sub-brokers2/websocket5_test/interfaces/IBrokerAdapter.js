/**
 * @interface IBrokerAdapter
 * Описує методи для передачі повідомлень між серверами кластера.
 */
export class IBrokerAdapter {
    /**
     * @param {string} topic
     * @param {Function} callback
     * @returns {Promise<Function>} - повертає функцію для відписки
     */
    async subscribe(topic, callback) {
        throw new Error('Not implemented')
    }

    /**
     * @param {string} topic
     * @param {any} data
     */
    async publish(topic, data) {
        throw new Error('Not implemented')
    }
}
