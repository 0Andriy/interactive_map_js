// public/client.js
const wsUrlInput = document.getElementById('ws-url-input')
const usernameInput = document.getElementById('username-input') // Нове поле
const passwordInput = document.getElementById('password-input') // Нове поле
const loginBtn = document.getElementById('login-btn') // Нова кнопка
const connectBtn = document.getElementById('connect-btn')
const messagesDiv = document.getElementById('messages')
const messageInput = document.getElementById('message-input')
const roomInput = document.getElementById('room-input')
const sendMessageBtn = document.querySelector('#input-area button:last-child')
const joinRoomBtn = document.querySelector('#room-actions button:first-child')
const leaveRoomBtn = document.querySelector('#room-actions button:last-child')
const roomInfoDiv = document.getElementById('room-info')

let ws = null
let currentRoom = null
let currentNamespace = null
let jwtToken = null // Змінна для зберігання JWT токену

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
    messagesDiv.scrollTop = messagesDiv.scrollHeight
}

// --- НОВА ФУНКЦІЯ: Автентифікація та отримання JWT ---
async function authenticate() {
    const username = usernameInput.value.trim()
    const password = passwordInput.value.trim()

    if (!username || !password) {
        alert("Будь ласка, введіть ім'я користувача та пароль.")
        return
    }

    appendMessage('Система', 'Спроба автентифікації...', 'system_message')
    try {
        const response = await fetch('http://localhost:3000/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        })

        const data = await response.json()

        if (response.ok) {
            jwtToken = data.token
            appendMessage('Система', 'Автентифікація успішна. Токен отримано!', 'system_message')
            loginBtn.disabled = true // Блокуємо кнопку логіну
            usernameInput.disabled = true
            passwordInput.disabled = true
            connectBtn.disabled = false // Розблоковуємо кнопку підключення до WS
            wsUrlInput.disabled = false // Розблоковуємо поле введення неймспейсу
        } else {
            appendMessage('Помилка автентифікації', data.message || 'Невідома помилка.', 'error')
            jwtToken = null
        }
    } catch (error) {
        console.error('Помилка автентифікації:', error)
        appendMessage(
            'Помилка автентифікації',
            `Не вдалося підключитися до сервера автентифікації: ${error.message}`,
            'error',
        )
        jwtToken = null
    }
}

// Функція ініціалізації WebSocket-з'єднання
function connectToWebSocket() {
    if (!jwtToken) {
        alert('Будь ласка, спочатку автентифікуйтесь, щоб отримати JWT токен.')
        return
    }

    const desiredNamespace = wsUrlInput.value.trim().toLowerCase()
    if (!desiredNamespace) {
        alert('Будь ласка, введіть назву неймспейсу (наприклад, "chat", "game").')
        return
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
        appendMessage(
            'Система',
            'Вже підключено. Спочатку відключіться, щоб змінити неймспейс.',
            'system_message',
        )
        return
    }

    // --- Передача JWT токену через URL-параметр (або заголовок) ---
    // Для простоти, передаємо токен як URL-параметр.
    // У реальному застосунку краще використовувати заголовки 'Authorization',
    // але це вимагає кастомної логіки на стороні клієнта/сервера для WS.
    // `ws` бібліотека на стороні сервера підтримує парсинг заголовка 'Authorization'.
    // На клієнті використання заголовків для WebSocket вимагає ручного керування `fetch` і `new WebSocket(url, protocol, options)`.
    // Для простоти цього прикладу, використовуємо URL-параметр.
    const wsUrl = `ws://localhost:3000/${desiredNamespace}?token=${jwtToken}`
    ws = new WebSocket(wsUrl)
    currentNamespace = desiredNamespace

    appendMessage('Система', `Спроба підключення до ${wsUrl}...`, 'system_message')

    ws.onopen = () => {
        appendMessage(
            'Система',
            `Підключено до сервера в неймспейсі /${currentNamespace}.`,
            'system_message',
        )
        roomInput.disabled = false
        joinRoomBtn.disabled = false
        connectBtn.disabled = true
        wsUrlInput.disabled = true
        // usernameInput.disabled = true; // Залишаються заблокованими після логіну
        // passwordInput.disabled = true;
        // loginBtn.disabled = true;
    }

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data)
            switch (data.type) {
                case 'chat_message':
                    appendMessage(data.sender, data.content)
                    break
                case 'system_message':
                    appendMessage('Система', data.content, 'system_message')
                    break
                case 'room_update':
                    roomInfoDiv.textContent = `Ви в кімнаті '${currentRoom}' (/${currentNamespace}). Користувачів: ${
                        data.userCount
                    } (${data.users.join(', ')})`
                    appendMessage('Система', data.message, 'system_message')
                    break
                case 'global_announcement':
                    appendMessage('Оголошення', data.content, 'system_message')
                    break
                case 'error':
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

    ws.onclose = () => {
        appendMessage(
            'Система',
            `Відключено від сервера (/${currentNamespace || 'невідомому неймспейсу'}).`,
            'system_message',
        )
        messageInput.disabled = true
        sendMessageBtn.disabled = true
        roomInput.disabled = true
        joinRoomBtn.disabled = true
        leaveRoomBtn.disabled = true

        // Розблоковуємо поля для нового логіну
        usernameInput.disabled = false
        passwordInput.disabled = false
        loginBtn.disabled = false
        connectBtn.disabled = true // Блокуємо connect, доки не буде нового логіну
        wsUrlInput.disabled = true // Блокуємо, доки не буде нового логіну

        roomInfoDiv.textContent = 'Відключено.'
        currentRoom = null
        currentNamespace = null
        jwtToken = null // Очищаємо токен при відключенні
    }

    ws.onerror = (error) => {
        appendMessage('Помилка', `Помилка WebSocket: ${error.message}`, 'error')
        console.error('WebSocket Error:', error)
    }
}

// Функції для приєднання, виходу та надсилання повідомлень залишаються БЕЗ ЗМІН
// (оскільки вони взаємодіють з WebSocket через об'єкт 'ws', який вже автентифікований)
function joinRoom() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Спочатку підключіться до сервера.')
        return
    }
    const roomName = roomInput.value.trim()
    if (roomName) {
        if (currentRoom) {
            ws.send(JSON.stringify({ type: 'leave_room', roomName: currentRoom }))
        }
        ws.send(JSON.stringify({ type: 'join_room', roomName: roomName }))
        currentRoom = roomName
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

function leaveRoom() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Ви не підключені до сервера.')
        return
    }
    if (currentRoom) {
        ws.send(JSON.stringify({ type: 'leave_room', roomName: currentRoom }))
        currentRoom = null
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

function sendMessage() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('Спочатку підключіться до сервера.')
        return
    }
    const message = messageInput.value.trim()
    if (message && currentRoom) {
        ws.send(JSON.stringify({ type: 'chat_message', content: message }))
        messageInput.value = ''
    } else if (!currentRoom) {
        alert('Будь ласка, приєднайтеся до кімнати, щоб надсилати повідомлення.')
    }
}

// Обробники подій
loginBtn.addEventListener('click', authenticate)
connectBtn.addEventListener('click', connectToWebSocket)
messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage()
    }
})

// Кнопки/поля за замовчуванням заблоковані до автентифікації/підключення
function updateButtonStates() {
    sendMessageBtn.disabled = !messageInput.value.trim() || !currentRoom
    // joinRoomBtn активна, якщо є назва кімнати, WS підключено, і ще не в кімнаті
    joinRoomBtn.disabled =
        !roomInput.value.trim() || !ws || ws.readyState !== WebSocket.OPEN || currentRoom
    leaveRoomBtn.disabled = !currentRoom // Активна, якщо є поточна кімната
    connectBtn.disabled = !jwtToken || !wsUrlInput.value.trim() // Активна, якщо є токен і введено неймспейс
}

messageInput.addEventListener('input', updateButtonStates)
roomInput.addEventListener('input', updateButtonStates)
wsUrlInput.addEventListener('input', updateButtonStates)

// Ініціалізація стану при завантаженні сторінки
function initializeUI() {
    messageInput.disabled = true
    sendMessageBtn.disabled = true
    roomInput.disabled = true
    joinRoomBtn.disabled = true
    leaveRoomBtn.disabled = true
    connectBtn.disabled = true // Спочатку блокуємо connect, доки не отримаємо токен
    wsUrlInput.disabled = true // Спочатку блокуємо WS URL, доки не отримаємо токен
    roomInfoDiv.textContent = 'Будь ласка, автентифікуйтесь.'
    updateButtonStates() // Оновлюємо стан кнопок на основі поточних умов
}

document.addEventListener('DOMContentLoaded', initializeUI)
