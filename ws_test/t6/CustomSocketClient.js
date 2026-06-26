// import { EventBus } from './EventBus.js'

// /**
//  * Клієнтська бібліотека (SDK) для фронтенду.
//  * Видає сигнал 'connect' (OPEN) ЛИШЕ після успішної перевірки токена сервером.
//  * Оптимізована під Highload Heartbeat.
//  */
// export class CustomSocketClient {
//     /**
//      * @param {string} url - Адреса сокет-сервера.
//      */
//     constructor(url) {
//         this.url = url
//         this.events = new EventBus()
//         this.ws = null
//         this.socketId = null
//         this.isReady = false

//         this.connect()
//     }

//     connect() {
//         this.ws = new WebSocket(this.url)

//         this.ws.onopen = () => {
//             console.log('[WS Network] TCP-канал відкрито. Очікуємо підтвердження авторизації...')
//         }

//         this.ws.onmessage = (messageEvent) => {
//             try {
//                 const parsed = JSON.parse(messageEvent.data)

//                 // ОПТИМІЗАЦІЯ ДЛЯ HIGHLOAD HEARTBEAT:
//                 // Якщо сервер перевіряє нас за допомогою фолбек-пінгу, миттєво відповідаємо
//                 // на рівні SDK без зайвого навантаження на логіку додатку.
//                 if (parsed.event === '__ping') {
//                     if (this.ws.readyState === WebSocket.OPEN) {
//                         this.ws.send(JSON.stringify({ event: '__pong', data: {} }))
//                     }
//                     return // Припиняємо обробку пакету
//                 }

//                 // Системна подія: Авторизація пройдена успішно, сервер дав добро
//                 if (parsed.event === 'connect') {
//                     this.isReady = true
//                     this.socketId = parsed.data.socketId
//                     console.log(
//                         '[WS SDK] Успішно авторизовано на сервері. ID сесії:',
//                         this.socketId,
//                     )

//                     // О herе! Тільки зараз для розробника сокет по-справжньому "OPEN"
//                     this.events.emit('connect', { socketId: this.socketId })
//                     return
//                 }

//                 // Системна подія: Сервер відхилив авторизацію
//                 if (parsed.event === 'connect_error') {
//                     console.error('[WS SDK] Сервер відхилив доступ:', parsed.data.message)
//                     this.events.emit('connect_error', parsed.data.message)
//                     return
//                 }

//                 // Звичайні бізнес-повідомлення (пропускаємо лише якщо авторизовані)
//                 if (this.isReady && parsed.event) {
//                     this.events.emit(parsed.event, parsed.data)
//                 }
//             } catch (err) {
//                 console.error('[WS SDK] Помилка обробки вхідного пакету:', err)
//             }
//         }

//         this.ws.onclose = (closeEvent) => {
//             this.isReady = false
//             this.socketId = null
//             console.log(
//                 `[WS Network] З'єднання розірвано. Код: ${closeEvent.code}, Причина: ${closeEvent.reason}`,
//             )
//             this.events.emit('disconnect', { code: closeEvent.code, reason: closeEvent.reason })
//         }

//         this.ws.onerror = (err) => {
//             this.events.emit('error', err)
//         }
//     }

//     on(event, callback) {
//         this.events.on(event, callback)
//     }

//     emit(event, data) {
//         if (!this.isReady || this.ws.readyState !== WebSocket.OPEN) {
//             console.warn(
//                 `[WS SDK] Заборонено відправку події "${event}": сокет не авторизований або закритий.`,
//             )
//             return false
//         }
//         this.ws.send(JSON.stringify({ event, data }))
//         return true
//     }

//     close() {
//         if (this.ws) this.ws.close()
//     }
// }

//

import { EventBus } from './EventBus.js'

/**
 * Полноцінний клієнтський SDK з підтримкою ACK (підтверджень) та таймаутів.
 */
export class CustomSocketClient {
    constructor(url) {
        this.url = url
        this.events = new EventBus()
        this.ws = null
        this.socketId = null
        this.isReady = false

        // Структури для клієнтського ACK
        this.ackCallbacks = new Map()
        this.ackCounter = 0

        this.connect()
    }

    connect() {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
            console.log('[WS Network] TCP канал відкрито. Очікуємо авторизацію...')
        }

        this.ws.onmessage = (messageEvent) => {
            try {
                const parsed = JSON.parse(messageEvent.data)

                // 1. Обробка сервісного Highload Heartbeat
                if (parsed.event === '__ping') {
                    if (this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify({ event: '__pong', data: {} }))
                    }
                    return
                }

                // 2. Системна подія: Успішна авторизація
                if (parsed.event === 'connect') {
                    this.isReady = true
                    this.socketId = parsed.data.socketId
                    this.events.emit('connect', { socketId: this.socketId })
                    return
                }

                // 3. Системна подія: Помилка авторизації
                if (parsed.event === 'connect_error') {
                    this.events.emit('connect_error', parsed.data.message)
                    return
                }

                // --- НОВА ЛОГІКА: ОБРОБКА АСИНХРОННИХ ACK ---

                // Сценарій А: Сервер повернув відповідь (ACK) на запит, який раніше надіслав клієнт
                if (parsed.isAckResponse) {
                    const cb = this.ackCallbacks.get(parsed.ackId)
                    if (cb) {
                        cb(parsed.data)
                        this.ackCallbacks.delete(parsed.ackId)
                    }
                    return
                }

                // Сценарій Б: Сервер надіслав подію і просить клієнта відповісти (ACK)
                if (this.isReady && parsed.event) {
                    let respondFunc = null

                    if (parsed.ackId) {
                        respondFunc = (resData) => {
                            if (this.ws.readyState === WebSocket.OPEN) {
                                this.ws.send(
                                    JSON.stringify({
                                        isAckResponse: true,
                                        ackId: parsed.ackId,
                                        data: resData,
                                    }),
                                )
                            }
                        }
                    }
                    // Емітимо подію у внутрішню шину. Третім параметром іде respondFunc
                    this.events.emit(parsed.event, parsed.data, respondFunc)
                }
            } catch (err) {
                console.error('[WS SDK] Помилка обробки пакету:', err)
            }
        }

        this.ws.onclose = (e) => {
            this.isReady = false
            this.ackCallbacks.clear()
            this.events.emit('disconnect', { code: e.code, reason: e.reason })
        }
    }

    on(event, callback) {
        this.events.on(event, callback)
    }

    /**
     * Оновлений метод emit з підтримкою коллбеку підтвердження (ACK)
     */
    emit(event, data, ackCallback = null) {
        if (!this.isReady || this.ws.readyState !== WebSocket.OPEN) return false

        const packet = { event, data }

        if (typeof ackCallback === 'function') {
            if (this.ackCounter >= 9007199254740991) this.ackCounter = 0
            const ackId = ++this.ackCounter
            this.ackCallbacks.set(ackId, ackCallback)
            packet.ackId = ackId
        }

        this.ws.send(JSON.stringify(packet))
        return true
    }

    /**
     * Оновлений метод timeout, що повертає Promise
     */
    timeout(ms) {
        return {
            emit: (event, data) => {
                return new Promise((resolve, reject) => {
                    if (!this.isReady || this.ws.readyState !== WebSocket.OPEN) {
                        return reject(new Error('Socket is not connected'))
                    }

                    if (this.ackCounter >= 9007199254740991) this.ackCounter = 0
                    const ackId = ++this.ackCounter
                    const packet = { event, data, ackId }

                    const timer = setTimeout(() => {
                        if (this.ackCallbacks.has(ackId)) {
                            this.ackCallbacks.delete(ackId)
                            reject(new Error(`Operation timed out after ${ms} ms`))
                        }
                    }, ms)

                    this.ackCallbacks.set(ackId, (resData) => {
                        clearTimeout(timer)
                        resolve(resData)
                    })

                    this.ws.send(JSON.stringify(packet))
                })
            },
        }
    }
}

// ! ---------------------------------

import { CustomSocketClient } from './CustomSocketClient.js'

// Зверніть увагу: шлях тепер '/ws/chat', оскільки неймспейс додається в кінець шляху
const socket = new CustomSocketClient('ws://localhost:3000/ws/chat?token=valid_secret_token_123')

socket.on('connect', async () => {
    console.log('Авторизацію пройдено!')

    // ТЕСТ 1: Клієнт викликає метод сервера через async/await та timeout
    try {
        console.log('Надсилаємо запит "get_server_time" на сервер...')
        const response = await socket
            .timeout(3000)
            .emit('get_server_time', { clientVersion: '1.0' })
        console.log('Відповідь від сервера отримана через ACK:', response) // Виведе { timestamp: ..., status: 'success' }
    } catch (err) {
        console.error('Сервер не відповів за 3 секунди:', err.message)
    }

    // ТЕСТ 2: Альтернативний варіант через класичний коллбек (без таймауту)
    socket.emit('get_server_time', { quick: true }, (data) => {
        console.log('Отримано час через звичайний коллбек:', data)
    })
})

// ТЕСТ 3: Обробка запиту ВІД СЕРВЕРА. Клієнт має повернути ACK
socket.on('ping_client', (data, callback) => {
    console.log('Сервер прислав запит ping_client:', data)

    if (typeof callback === 'function') {
        // Повертаємо серверу дані. На сервері виконається resolve() у промісі
        callback({ clientStatus: 'I am alive!', battery: 98 })
    }
})
