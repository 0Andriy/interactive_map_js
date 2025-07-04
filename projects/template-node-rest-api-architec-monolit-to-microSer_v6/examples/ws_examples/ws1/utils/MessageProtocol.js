// // utils/MessageProtocol.js
// export class MessageProtocol {
//     static serialize(event, data, namespace = '/', room = null) {
//         // Простий протокол: { event: 'eventName', data: any, _ns: '/namespace', _room: 'roomName' }
//         return JSON.stringify({ event, data, _ns: namespace, _room: room })
//     }

//     static deserialize(message) {
//         try {
//             const parsed = JSON.parse(message)
//             if (typeof parsed.event === 'string' && typeof parsed.data !== 'undefined') {
//                 return parsed
//             }
//             throw new Error('Invalid message format')
//         } catch (error) {
//             console.error('MessageProtocol error deserializing:', message, error)
//             return null
//         }
//     }
// }

// utils/MessageProtocol.js (оновлений)

// Префікс для бінарних повідомлень (нехай буде символ, який не зустрічається в JSON)
const BINARY_PREFIX = Buffer.from([0x01]) // Використовуємо байт 0x01 як індикатор бінарних даних

export class MessageProtocol {
    // isBinary: чи є data бінарними даними (Buffer, ArrayBuffer)
    static serialize(event, data, namespace = '/', room = null, isBinary = false) {
        if (isBinary) {
            // Якщо дані бінарні, метадані повинні бути окремо, а потім бінарні дані
            const metadata = JSON.stringify({ event, _ns: namespace, _room: room, isBinary: true })
            const metadataBuffer = Buffer.from(metadata, 'utf8')

            // Формат: [BINARY_PREFIX][довжина_метаданих (4 байти)][метадані][бінарні_дані]
            const lengthBuffer = Buffer.alloc(4)
            lengthBuffer.writeUInt32BE(metadataBuffer.length, 0) // Записуємо довжину метаданих

            return Buffer.concat([BINARY_PREFIX, lengthBuffer, metadataBuffer, data])
        } else {
            // Для текстових даних - той самий JSON-формат
            return JSON.stringify({ event, data, _ns: namespace, _room: room, isBinary: false })
        }
    }

    static deserialize(message) {
        if (message instanceof Buffer || message instanceof ArrayBuffer) {
            const buffer = Buffer.from(message)

            // Перевіряємо префікс для бінарних даних
            if (buffer.slice(0, BINARY_PREFIX.length).equals(BINARY_PREFIX)) {
                const metadataLength = buffer.readUInt32BE(BINARY_PREFIX.length)
                const metadataBuffer = buffer.slice(
                    BINARY_PREFIX.length + 4,
                    BINARY_PREFIX.length + 4 + metadataLength,
                )
                const binaryData = buffer.slice(BINARY_PREFIX.length + 4 + metadataLength)

                try {
                    const metadata = JSON.parse(metadataBuffer.toString('utf8'))
                    return {
                        event: metadata.event,
                        data: binaryData, // Повертаємо Buffer
                        _ns: metadata._ns,
                        _room: metadata._room,
                        isBinary: true,
                    }
                } catch (error) {
                    console.error('MessageProtocol error deserializing binary metadata:', error)
                    return null
                }
            }
        }

        // Якщо не бінарні або не мають бінарного префікса, обробляємо як JSON
        try {
            const parsed = JSON.parse(message.toString())
            if (typeof parsed.event === 'string' && typeof parsed.data !== 'undefined') {
                return parsed
            }
            throw new Error('Invalid message format')
        } catch (error) {
            console.error('MessageProtocol error deserializing text:', message.toString(), error)
            return null
        }
    }
}
