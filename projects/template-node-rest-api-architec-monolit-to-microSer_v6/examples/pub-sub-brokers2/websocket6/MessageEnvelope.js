// MessageEnvelope.js
import crypto from 'crypto'

export class MessageEnvelope {
    /**
     * @param {Object} params
     * @param {string} params.ns - Namespace
     * @param {string|null} params.room - Room name
     * @param {string} params.event - Event name
     * @param {any} params.payload - Data
     * @param {string|null} params.sender - Sender ID
     */
    static create({ ns, room, event, payload, sender }) {
        return {
            id: crypto.randomUUID(),
            ns: ns,
            room: room || null,
            event: event,
            sender: sender || 'system',
            payload: payload,
            ts: Date.now(),
            v: '1.0',
            meta: {
                // traceId для OpenTelemetry або дебагу
                traceId: crypto.randomBytes(4).toString('hex'),
            },
        }
    }
}
