/**
 * Абстрактний базовий клас для всіх адаптерів просторів імен (Namespace Adapters).
 * Визначає обов'язковий інтерфейс для керування кімнатами та бродкасту.
 * @abstract
 */
export class BaseAdapter {
    /**
     * @param {object} nsp - Простір імен (Namespace), якому належить адаптер.
     */
    constructor(nsp) {
        if (this.constructor === BaseAdapter) {
            throw new TypeError('Cannot construct BaseAdapter instances directly (abstract class).')
        }

        if (!nsp) {
            throw new Error('Adapter must be initialized with a valid Namespace instance.')
        }

        /**
         * Посилання на простір імен (Namespace).
         * @type {object}
         * @protected
         */
        this.nsp = nsp
    }

    /** @abstract */
    async add(socketId, roomName) {
        throw new Error('Method "add" must be implemented.')
    }

    /** @abstract */
    async addAll(socketId, rooms) {
        throw new Error('Method "addAll" must be implemented.')
    }

    /** @abstract */
    async del(socketId, roomName) {
        throw new Error('Method "del" must be implemented.')
    }

    /** @abstract */
    async delAll(socketId) {
        throw new Error('Method "delAll" must be implemented.')
    }

    /** @abstract */
    async getRoomsBySocket(socketId) {
        throw new Error('Method "getRoomsBySocket" must be implemented.')
    }

    /** @abstract */
    async fetchSockets(opts) {
        throw new Error('Method "fetchSockets" must be implemented.')
    }

    /** @abstract */
    async broadcast(packet, opts) {
        throw new Error('Method "broadcast" must be implemented.')
    }
}
