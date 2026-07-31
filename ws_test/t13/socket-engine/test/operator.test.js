import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { BroadcastOperator } from '../core/BroadcastOperator.js' // перевірте ваш шлях

// Створюємо правильний Mock-адаптер
function createMockAdapter() {
    return {
        broadcastCalledWith: null,
        socketsJoinCalledWith: null,
        fetchSocketsCalledWith: null,

        broadcast(packet, opts) {
            this.broadcastCalledWith = { packet, opts }
        },
        async socketsJoin(opts, rooms) {
            this.socketsJoinCalledWith = { opts, rooms }
            return true
        },
        async fetchSockets(opts) {
            this.fetchSocketsCalledWith = { opts }
            return [
                {
                    id: 'socket_1',
                    emit(event, data, meta, callback) {
                        // Клієнт успішно відповідає
                        callback('client_response_1')
                    },
                },
            ]
        },
    }
}

describe('BroadcastOperator Tests', () => {
    test('should initialize with correct default properties', () => {
        const adapter = createMockAdapter()
        const operator = new BroadcastOperator(adapter)

        assert.ok(operator._rooms instanceof Set)
        assert.strictEqual(operator._rooms.size, 0)
        assert.ok(operator._except instanceof Set)
        assert.deepEqual(operator._flags, {})
    })

    test('should chain .to() and maintain immutability', () => {
        const adapter = createMockAdapter()
        const op1 = new BroadcastOperator(adapter)

        const op2 = op1.to('room1').to(['room2', 'room3'])

        assert.strictEqual(op1._rooms.size, 0)
        assert.strictEqual(op2._rooms.size, 3)
        assert.ok(op2._rooms.has('room1'))
        assert.ok(op2._rooms.has('room2'))
    })

    test('should chain .except() correctly to filter socket IDs or rooms', () => {
        const adapter = createMockAdapter()
        const operator = new BroadcastOperator(adapter).except('socket_abc').except(['room_hidden'])

        assert.strictEqual(operator._except.size, 2)
        assert.ok(operator._except.has('socket_abc'))
        assert.ok(operator._except.has('room_hidden'))
    })

    test('should chain flags like .volatile, .local, and .timeout()', () => {
        const adapter = createMockAdapter()
        const operator = new BroadcastOperator(adapter).volatile.local.timeout(5000)

        assert.strictEqual(operator._flags.volatile, true)
        assert.strictEqual(operator._flags.local, true)
        assert.strictEqual(operator._flags.timeout, 5000)
    })

    test('should throw error on invalid event type in .emit()', () => {
        const adapter = createMockAdapter()
        const operator = new BroadcastOperator(adapter)

        assert.throws(() => {
            operator.emit(null, 'data')
        }, TypeError)

        assert.throws(() => {
            operator.emit('   ', 'data')
        }, TypeError)
    })

    test('should correctly build payload and meta in .emit()', () => {
        const adapter = createMockAdapter()
        const operator = new BroadcastOperator(adapter).to('general')

        const testData = { text: 'Hello' }
        operator.emit('chat_message', testData)

        const call = adapter.broadcastCalledWith

        assert.strictEqual(call.packet.type, 'event')
        assert.strictEqual(call.packet.event, 'chat_message')

        // ВИПРАВЛЕНО: Ваш клас видає чистий об'єкт, а не масив з одного елемента! Це супер!
        assert.deepEqual(call.packet.data, testData)

        assert.ok(call.packet.meta.id)
        assert.strictEqual(typeof call.packet.meta.id, 'string')
        assert.strictEqual(typeof call.packet.meta.timestamp, 'number')
        assert.ok(call.opts.rooms.has('general'))
    })

    test('should invoke validation guarding inside .socketsJoin()', async () => {
        const adapter = createMockAdapter()
        const operator = new BroadcastOperator(adapter)

        // ВИПРАВЛЕНО: додано await для асинхронного методу
        await operator.socketsJoin([123, null, 'clean_room'])

        assert.deepEqual(adapter.socketsJoinCalledWith.rooms, ['123', 'clean_room'])
    })

    test('should process modern async Acknowledgements with callbacks', async () => {
        const adapter = createMockAdapter()
        const operator = new BroadcastOperator(adapter)

        // ВИПРАВЛЕНО: огортаємо в Promise, щоб тест гарантовано дочекався асинхронної відповіді сокета
        await new Promise((resolve, reject) => {
            try {
                operator.emit('get_status', 'param1', (err, responses) => {
                    assert.strictEqual(err, null)
                    assert.deepEqual(responses, ['client_response_1'])
                    resolve()
                })
            } catch (error) {
                reject(error)
            }
        })

        assert.ok(adapter.fetchSocketsCalledWith)
    })
})
