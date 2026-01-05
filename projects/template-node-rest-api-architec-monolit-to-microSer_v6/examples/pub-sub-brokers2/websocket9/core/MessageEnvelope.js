import crypto from 'crypto'

/**
 * @typedef {Object} EnvelopeInput
 * @property {string} ns - Простір імен (Namespace).
 * @property {string} event - Назва події.
 * @property {any} payload - Дані повідомлення.
 * @property {string} [room] - ID кімнати (опціонально).
 * @property {string} [sender='system'] - Ідентифікатор відправника.
 * @property {string} [traceId] - Існуючий ідентифікатор трасування.
 */

/**
 * @typedef {Object} MessageEnvelopeDTO
 * @property {string} id - Унікальний UUID повідомлення.
 * @property {string} ns - Простір імен.
 * @property {string|null} room - Кімната.
 * @property {string} event - Подія.
 * @property {string} sender - Відправник.
 * @property {any} payload - Корисне навантаження.
 * @property {number} ts - Timestamp (Unix epoch).
 * @property {string} v - Версія схеми повідомлення.
 * @property {Object} meta - Метадані для трасування та логування.
 * @property {string} meta.traceId - Короткий ID для відстеження ланцюжка подій.
 */

/**
 * Клас-фабрика для створення стандартизованих конвертів повідомлень.
 * Забезпечує єдиний формат обміну даними між сокетами, брокером та клієнтом.
 *
 * @class MessageEnvelope
 */
export class MessageEnvelope {
    /**
     * Створює новий екземпляр конверта повідомлення.
     *
     * @param {EnvelopeInput} params
     * @returns {Readonly<MessageEnvelopeDTO>} Заморожений об'єкт повідомлення.
     * @throws {Error} Якщо відсутні обов'язкові поля ns або event.
     */
    static create({ ns, room, event, payload, sender, traceId }) {
        if (!ns || !event) {
            throw new Error(
                `[${this.constructor.name}] Missing required fields: ${!ns ? 'ns' : 'event'}`,
            )
        }

        const envelope = {
            id: crypto.randomUUID(),
            ns,
            room: room || null,
            event,
            sender: sender || 'system',
            payload,
            ts: Date.now(),
            v: '1.0',
            meta: {
                traceId: traceId || crypto.randomBytes(4).toString('hex'),
            },
        }

        // Заморожуємо об'єкт, щоб запобігти випадковим змінам у middleware
        return Object.freeze(envelope)
    }

    /**
     * Перевіряє, чи є об'єкт валідним конвертом повідомлення.
     *
     * @param {any} obj
     * @returns {boolean}
     */
    static isValid(obj) {
        return !!(obj && obj.id && obj.ns && obj.event && obj.ts)
    }
}
