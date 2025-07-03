// public/client.js
// Отримуємо посилання на HTML-елементи
const wsUrlInput = document.getElementById('ws-url-input') // Поле для введення неймспейсу
const connectBtn = document.getElementById('connect-btn') // Кнопка підключення
const messagesDiv = document.getElementById('messages')
const messageInput = document.getElementById('message-input')
const roomInput = document.getElementById('room-input')
const sendMessageBtn = document.querySelector('#input-area button:last-child')
const joinRoomBtn = document.querySelector('#room-actions button:first-child')
const leaveRoomBtn = document.querySelector('#room-actions button:last-child')
const roomInfoDiv = document.getElementById('room-info')

let ws = null // Змінна для зберігання об'єкта WebSocket
let currentRoom = null // Змінна для відстеження поточної кімнати, до якої приєднаний клієнт
let currentNamespace = null // Змінна для відстеження поточного неймспейсу

// Функція для додавання повідомлень у чат-інтерфейс
function appendMessage(sender, content, type = 'chat_message') {
    const messageElement = document.createElement('div')
    messageElement.classList.add('message')
    if (type === 'system_message') {
        messageElement.classList.add('system_message')
    } else if (type === 'error') {
        messageElement.classList.add('error_message')
    }

    if (sender) {
        const senderSpan = document.createElement('span')
        senderSpan.classList.add('sender')
        senderSpan.textContent = sender + ': '
        messageElement.appendChild(senderSpan)
    }
    messageElement.appendChild(document.createTextNode(content))
    messagesDiv.appendChild(messageElement)

    // Автоматична прокрутка до низу чату
    messagesDiv.scrollTop = messagesDiv.scrollHeight
}

// Функція ініціалізації WebSocket-з'єднання
function connectToWebSocket() {
    const desiredNamespace = wsUrlInput.value.trim().toLowerCase() // Отримуємо бажаний неймспейс
    if (!desiredNamespace) {
        alert('Будь ласка, введіть назву неймспейсу (наприклад, "chat", "game").')
        return
    }

    // Якщо з'єднання вже існує і воно відкрите, запобігаємо повторному підключенню
    if (ws && ws.readyState === WebSocket.OPEN) {
        appendMessage(
            'Система',
            'Вже підключено. Спочатку відключіться, щоб змінити неймспейс.',
            'system_message',
        )
        return
    }

    // Формуємо URL для підключення до конкретного неймспейсу
    const wsUrl = `ws://localhost:3000/${desiredNamespace}`
    ws = new WebSocket(wsUrl) // Створюємо нове WebSocket-з'єднання
    currentNamespace = desiredNamespace // Зберігаємо поточний неймспейс

    appendMessage('Система', `Спроба підключення до ${wsUrl}...`, 'system_message')

    // Обробник події "з'єднання встановлено"
    ws.onopen = () => {
        appendMessage(
            'Система',
            `Підключено до сервера в неймспейсі /${currentNamespace}.`,
            'system_message',
        )
        // Розблоковуємо елементи інтерфейсу після підключення
        roomInput.disabled = false
        joinRoomBtn.disabled = false
        connectBtn.disabled = true // Блокуємо кнопку "Підключитися"
        wsUrlInput.disabled = true // Блокуємо поле для введення URL
    }

    // Обробник події "отримано повідомлення"
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data) // Парсимо JSON-повідомлення
            switch (data.type) {
                case 'chat_message':
                    appendMessage(data.sender, data.content)
                    break
                case 'system_message':
                    appendMessage('Система', data.content, 'system_message')
                    break
                case 'room_update': // Оновлення інформації про кімнату (надіслане RoomManager)
                    roomInfoDiv.textContent = `Ви в кімнаті '${currentRoom}' (/${currentNamespace}). Користувачів: ${
                        data.userCount
                    } (${data.users.join(', ')})`
                    appendMessage('Система', data.message, 'system_message')
                    break
                case 'global_announcement': // Глобальні оголошення від сервера
                    appendMessage('Оголошення', data.content, 'system_message')
                    break
                case 'error': // Повідомлення про помилку
                    appendMessage('Помилка', data.message, 'error')
                    break
                default:
                    appendMessage(
                        'Система',
                        `Отримано невідоме повідомлення: ${event.data}`,
                        'system_message',
                    )
            }
        } catch (e) {
            console.error('Помилка парсингу JSON або обробки повідомлення:', e)
            appendMessage('Помилка', `Невідомий формат повідомлення: ${event.data}`, 'error')
        }
    }

    // Обробник події "з'єднання закрито"
    ws.onclose = () => {
        appendMessage(
            'Система',
            `Відключено від сервера (/${currentNamespace || 'невідомому неймспейсу'}).`,
            'system_message',
        )
        // Блокуємо всі елементи інтерфейсу, пов'язані з чатом
        messageInput.disabled = true
        sendMessageBtn.disabled = true
        roomInput.disabled = true
        joinRoomBtn.disabled = true
        leaveRoomBtn.disabled = true
        connectBtn.disabled = false // Розблоковуємо кнопку "Підключитися"
        wsUrlInput.disabled = false // Розблоковуємо поле для введення URL
        roomInfoDiv.textContent = 'Відключено.'
        currentRoom = null
        currentNamespace = null
    }

    // Обробник події "помилка з'єднання"
    ws.onerror = (error) => {
        appendMessage('Помилка', `Помилка WebSocket: ${error.message}`, 'error')
        console.error('WebSocket Error:', error)
    }
}

// Функція для приєднання до кімнати
function joinRoom() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Спочатку підключіться до сервера.')
        return
    }
    const roomName = roomInput.value.trim()
    if (roomName) {
        // Якщо клієнт вже в кімнаті, спочатку покидаємо її
        if (currentRoom) {
            ws.send(JSON.stringify({ type: 'leave_room', roomName: currentRoom }))
        }
        // Надсилаємо запит на приєднання до нової кімнати
        ws.send(JSON.stringify({ type: 'join_room', roomName: roomName }))
        currentRoom = roomName // Оновлюємо поточну кімнату
        // Розблоковуємо/блокуємо відповідні елементи інтерфейсу
        messageInput.disabled = false
        sendMessageBtn.disabled = false
        leaveRoomBtn.disabled = false
        joinRoomBtn.disabled = true
        roomInput.disabled = true
        roomInfoDiv.textContent = `Спроба приєднатися до '${roomName}' (/${currentNamespace})...`
    } else {
        alert('Будь ласка, введіть назву кімнати.')
    }
}

// Функція для виходу з кімнати
function leaveRoom() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Ви не підключені до сервера.')
        return
    }
    if (currentRoom) {
        // Надсилаємо запит на вихід з поточної кімнати
        ws.send(JSON.stringify({ type: 'leave_room', roomName: currentRoom }))
        currentRoom = null // Очищаємо поточну кімнату
        // Блокуємо/розблоковуємо відповідні елементи інтерфейсу
        messageInput.disabled = true
        sendMessageBtn.disabled = true
        leaveRoomBtn.disabled = true
        joinRoomBtn.disabled = false
        roomInput.disabled = false
        roomInfoDiv.textContent = 'Не приєднано до кімнати.'
    } else {
        alert('Ви не приєднані до жодної кімнати.')
    }
}

// Функція для надсилання повідомлення в чат
function sendMessage() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Спочатку підключіться до сервера.')
        return
    }
    const message = messageInput.value.trim()
    if (message && currentRoom) {
        // Надсилаємо чат-повідомлення
        ws.send(JSON.stringify({ type: 'chat_message', content: message }))
        messageInput.value = '' // Очищаємо поле вводу
    } else if (!currentRoom) {
        alert('Будь ласка, приєднайтеся до кімнати, щоб надсилати повідомлення.')
    }
}

// Обробник події "натискання клавіші" для поля введення повідомлень (для відправки по Enter)
messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage()
    }
})

// Обробники подій 'input' для кнопок, щоб контролювати їх активність
messageInput.addEventListener('input', () => {
    sendMessageBtn.disabled = !messageInput.value.trim() || !currentRoom
})
roomInput.addEventListener('input', () => {
    // Кнопка "Приєднатися" активна, якщо є назва кімнати, WS підключено і клієнт ще не в кімнаті
    joinRoomBtn.disabled =
        !roomInput.value.trim() || !ws || ws.readyState !== WebSocket.OPEN || currentRoom
})

// Додаємо обробник для кнопки "Підключитися"
connectBtn.addEventListener('click', connectToWebSocket)

// Початкове блокування кнопок/полів при завантаженні сторінки
// Заблоковано все, крім поля введення URL і кнопки "Підключитися"
messageInput.disabled = true
sendMessageBtn.disabled = true
roomInput.disabled = true
joinRoomBtn.disabled = true
leaveRoomBtn.disabled = true
