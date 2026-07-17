const unitSelect = document.getElementById('select-unit')
const fileSelect = document.getElementById('select-file')
const viewport = document.getElementById('monitor-viewport')
const canvasArea = document.getElementById('canvas-area')
const bgLayer = document.getElementById('bg-layer')
const dynamicLayer = document.getElementById('dynamic-layer')
const tooltip = document.getElementById('global-tooltip')
const timeEl = document.getElementById('update-time')

let config = null

/**
 * Вписуємо схему у видиму область (Fit-to-Screen)
 */
function fitToScreen() {
    if (!config) return

    const origW = parseInt(config.w)
    const origH = parseInt(config.h)
    const viewW = viewport.clientWidth - 40
    const viewH = viewport.clientHeight - 40

    const scale = Math.min(viewW / origW, viewH / origH)

    canvasArea.style.width = `${origW * scale}px`
    canvasArea.style.height = `${origH * scale}px`
}

/**
 * Завантаження конфігурації та графіки
 */
async function loadMonitor() {
    const unitId = unitSelect.value
    const fileName = fileSelect.value
    const xmlName = fileName.replace('.png', '.xml')

    try {
        const res = await fetch(`/api/v1/ios/fragment/xml/${unitId}?fileName=${xmlName}`)
        const data = await res.json()

        // Зберігаємо частину fragment з отриманого JSON
        config = data.fragment

        fitToScreen()
        bgLayer.src = `/api/v1/ios/fragment/png/${unitId}?fileName=${fileName}`

        renderNodes()
    } catch (err) {
        console.error('Помилка завантаження схеми:', err)
    }
}

/**
 * Рендеринг датчиків
 */
function renderNodes() {
    dynamicLayer.innerHTML = ''
    const origW = parseInt(config.w)
    const origH = parseInt(config.h)
    const items = config.dynamic?.dtext || []

    items.forEach((item) => {
        const node = document.createElement('div')
        node.className = 'sensor-node'
        node.id = `node-${item.params.param.iden}`

        // Зберігаємо метадані для тултіпа
        node._meta = item

        // Координати у % відносно оригінального розміру
        node.style.left = `${(parseInt(item.x) / origW) * 100}%`
        node.style.top = `${(parseInt(item.y) / origH) * 100}%`
        node.style.width = `${(parseInt(item.w) / origW) * 100}%`
        node.style.height = `${(parseInt(item.h) / origH) * 100}%`

        // Виводимо ТІЛЬКИ значення з info.text
        // node.innerHTML = `<span class="s-value">${item.info.text}</span>`
        node.innerHTML = `<span class="s-value">0</span>`

        dynamicLayer.appendChild(node)
    })
}

/**
 * Логіка тултіпа (делегування подій)
 */
dynamicLayer.addEventListener('mousemove', (e) => {
    const target = e.target.closest('.sensor-node')
    if (target) {
        const meta = target._meta
        tooltip.style.display = 'block'
        tooltip.style.left = `${e.clientX + 15}px`
        tooltip.style.top = `${e.clientY + 15}px`
        tooltip.innerHTML = `
            <div style="color:#60a5fa;font-weight:bold;margin-bottom:4px">${meta.params.param.iden}</div>
            <div style="font-size:11px">Одиниці: <b>${meta.params.param.mas}</b></div>
            <div style="font-size:11px">Значення: ${meta.info.text}</div>
        `
    } else {
        tooltip.style.display = 'none'
    }
})

dynamicLayer.addEventListener('mouseleave', () => (tooltip.style.display = 'none'))

/**
 * WebSocket оновлення
 */
const socket = new WebSocket(`ws://${window.location.host}`)
socket.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.event === 'IOS_UPDATE') {
        const data = msg.data // Очікуємо формат { IDEN_NAME: "значення" }
        Object.keys(data).forEach((iden) => {
            const valEl = document.querySelector(`#node-${iden} .s-value`)
            if (valEl) valEl.innerText = data[iden]
        })
        timeEl.innerText = new Date().toLocaleTimeString()
    }
}

// Listeners
window.addEventListener('resize', fitToScreen)
unitSelect.onchange = loadMonitor
fileSelect.onchange = loadMonitor

document.getElementById('fs-toggle').onclick = () => {
    const wrapper = document.getElementById('monitor-wrapper')
    if (!document.fullscreenElement) wrapper.requestFullscreen()
    else document.exitFullscreen()
}

// Старт
loadMonitor()
