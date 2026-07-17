const wrapper = document.getElementById('monitor-wrapper')
const fsBtn = document.getElementById('fullscreen-btn')
const timeEl = document.getElementById('update-time')

// 1. Повноекранний режим
fsBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        wrapper.requestFullscreen().catch((err) => {
            alert(`Error: ${err.message}`)
        })
        fsBtn.innerText = '✕ Вийти'
    } else {
        document.exitFullscreen()
        fsBtn.innerText = '⛶ Повний екран'
    }
})

// 2. Отримання даних через WebSocket
const socket = new WebSocket(`ws://${window.location.host}`)

socket.onmessage = (event) => {
    const data = JSON.parse(event.data)

    if (data.event === 'IOS_UPDATE') {
        updateUI(data.payload)
    }
}

function updateUI(payload) {
    // Оновлюємо значення за ID параметрів
    if (payload.temp) document.getElementById('val-temp').innerText = payload.temp
    if (payload.press) document.getElementById('val-press').innerText = payload.press

    timeEl.innerText = new Date().toLocaleTimeString()
}
