const priceEl = document.getElementById('live-price')
const logEl = document.getElementById('event-log')

const socket = new WebSocket(`ws://${window.location.host}`)

socket.onmessage = (event) => {
    const data = JSON.parse(event.data)

    if (data.type === 'UPDATE') {
        // Оновлення ціни
        priceEl.innerText = `$${data.payload.price}`

        // Анімація оновлення
        priceEl.style.color = '#3b82f6'
        setTimeout(() => (priceEl.style.color = '#1e293b'), 400)

        // Додавання логу
        const entry = document.createElement('div')
        entry.className = 'log-entry'
        entry.innerText = `[${new Date().toLocaleTimeString()}] Отримано нову ціну: ${data.payload.price}`
        logEl.prepend(entry)
    }
}

socket.onclose = () => {
    document.getElementById('connection-status').innerText = 'Disconnected'
    document.getElementById('connection-status').className = 'status-error'
}
