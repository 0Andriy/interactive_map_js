import WSAdapter from './WSAdapter.js'

const ws = new WSAdapter('wss://echo.websocket.org')

// Підписка на дані
ws.on('data', (data) => {
    console.log('Отримано повідомлення:', data)
})

// Підписка на статус
ws.on('statusChange', (status) => {
    console.log(`Поточний статус з'єднання: ${status}`)
})

// Запуск
await ws.connect()

// Відправка простого повідомлення
ws.send({ message: 'Привіт, сервере!' })

// 2
async function getUserProfile(userId) {
    try {
        // Метод request сам додає requestId і чекає на відповідь
        const response = await ws.request(
            {
                action: 'get_user',
                id: userId,
            },
            5000,
        ) // таймаут 5 секунд

        console.log('Дані користувача:', response)
    } catch (error) {
        console.error('Не вдалося отримати дані:', error.message)
    }
}

// 3
const options = {
    // Функція викликатиметься перед кожним (ре)коннектом
    authProvider: async () => {
        const resp = await fetch('api.yourserver.com')
        const { token } = await resp.json()
        return token
    },

    rateLimitDelay: 200, // Відправляти повідомлення не частіше ніж раз у 200мс
    pingInterval: 15000, // Пінгувати сервер кожні 15 сек
    maxRetries: 20, // Збільшена кількість спроб перепідключення
    autoJson: true, // Автоматично перетворювати об'єкти в JSON-рядки
}

const secureWS = new WSAdapter('wss://api.yourserver.com', options)

secureWS.on('connected', () => {
    console.log('Успішна авторизація та підключення!')
})

await secureWS.connect()

// Навіть якщо ми викличемо send 10 разів поспіль,
// адаптер відправить їх з інтервалом у 200мс завдяки Rate Limiter
for (let i = 0; i < 10; i++) {
    secureWS.send({ event: 'log', id: i })
}


// 4
const binaryWS = new WSAdapter('wss://api.example.com/images', {
    binaryType: 'arraybuffer', // або 'blob'
})

binaryWS.on('binary', (buffer) => {
    console.log('Отримано бінарні дані, довжина:', buffer.byteLength)
    // Обробка ArrayBuffer...
})

await binaryWS.connect()
