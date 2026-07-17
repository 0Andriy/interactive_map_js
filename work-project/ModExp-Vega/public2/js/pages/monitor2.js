const unitSelect = document.getElementById('select-unit')
const fileSelect = document.getElementById('select-file')
const canvasArea = document.getElementById('canvas-area')
const bgLayer = document.getElementById('bg-layer')
const dynamicLayer = document.getElementById('dynamic-layer')
const timeEl = document.getElementById('update-time')

let config = null

async function initMonitor() {
    const unitId = unitSelect.value
    const fileName = fileSelect.value
    const xmlFile = fileName.replace('.png', '.xml')

    try {
        // 1. Отримуємо конфігурацію (fragment JSON розпарсений з XML)
        const res = await fetch(`/api/v1/ios/fragment/xml/${unitId}?fileName=${xmlFile}`)
        const data = await res.json()

        // Очікуємо структуру: data.fragment.w, data.fragment.h, data.fragment.dynamic.dtext
        config = data.fragment

        // 2. Налаштування пропорцій контейнера
        const w = parseInt(config.w)
        const h = parseInt(config.h)
        const aspectRatio = (h / w) * 100

        canvasArea.style.width = '100%'
        canvasArea.style.paddingBottom = `${aspectRatio}%` // Техніка підтримки пропорцій

        // 3. Завантаження фону
        bgLayer.src = `/api/v1/ios/fragment/png/${unitId}?fileName=${fileName}`

        renderSensors(w, h)
    } catch (err) {
        console.error('Monitor Load Error:', err)
    }
}

function renderSensors(origW, origH) {
    dynamicLayer.innerHTML = ''
    const sensors = config.dynamic?.dtext || []

    sensors.forEach((item) => {
        const node = document.createElement('div')
        node.className = 'sensor-node'
        node.id = `iden-${item.params.param.iden}`

        // Розрахунок позиції у %
        const x = (parseInt(item.x) / origW) * 100
        const y = (parseInt(item.y) / origH) * 100
        const width = (parseInt(item.w) / origW) * 100
        const height = (parseInt(item.h) / origH) * 100

        node.style.left = `${x}%`
        node.style.top = `${y}%`
        node.style.width = `${width}%`
        node.style.height = `${height}%`

        node.innerHTML = `
            <span class="s-value">${item.info.text}</span>
            <span class="s-unit">${item.params.param.mas}</span>
        `

        dynamicLayer.appendChild(node)
    })
}

// WebSocket для оновлення значень
const socket = new WebSocket(`ws://${window.location.host}`)
socket.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.event === 'IOS_UPDATE') {
        const payload = msg.data
        // Припускаємо payload = { IDEN_NAME: "25.4", ... }
        Object.keys(payload).forEach((iden) => {
            const el = document.getElementById(`iden-${iden}`)
            if (el) {
                el.querySelector('.s-value').innerText = payload[iden]
            }
        })
        timeEl.innerText = new Date().toLocaleTimeString()
    }
}

// Listeners
unitSelect.addEventListener('change', initMonitor)
fileSelect.addEventListener('change', initMonitor)

// Fullscreen
document.getElementById('fs-toggle').onclick = () => {
    const wrapper = document.getElementById('monitor-wrapper')
    if (!document.fullscreenElement) wrapper.requestFullscreen()
    else document.exitFullscreen()
}

initMonitor()
