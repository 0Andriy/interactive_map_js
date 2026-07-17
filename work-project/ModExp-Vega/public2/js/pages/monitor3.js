const unitSelect = document.getElementById('select-unit')
const fileSelect = document.getElementById('select-file')
const viewport = document.getElementById('viewport')
const canvasArea = document.getElementById('canvas-area')
const bgLayer = document.getElementById('bg-layer')
const dynamicLayer = document.getElementById('dynamic-layer')
const tooltip = document.getElementById('global-tooltip')
const timeEl = document.getElementById('update-time')

let config = null

// 1. Функція масштабування "Fit to Screen"
function fitToScreen(origW, origH) {
    const vw = viewport.clientWidth - 40
    const vh = viewport.clientHeight - 40

    const scale = Math.min(vw / origW, vh / origH)

    canvasArea.style.width = `${origW * scale}px`
    canvasArea.style.height = `${origH * scale}px`
}

// 2. Завантаження схеми
async function loadMonitor() {
    const unitId = unitSelect.value
    const fileName = fileSelect.value
    const xmlName = fileName.replace('.png', '.xml')

    try {
        const res = await fetch(`/api/v1/ios/fragment/xml/${unitId}?fileName=${xmlName}`)
        const data = await res.json()
        config = data.fragment

        // Встановлюємо розміри
        fitToScreen(parseInt(config.w), parseInt(config.h))

        // Завантажуємо фон
        bgLayer.src = `/api/v1/ios/fragment/png/${unitId}?fileName=${fileName}`

        renderNodes()
    } catch (e) {
        console.error('Load Error:', e)
    }
}

// 3. Рендер датчиків
function renderNodes() {
    dynamicLayer.innerHTML = ''
    const origW = parseInt(config.w)
    const origH = parseInt(config.h)
    const items = config.dynamic?.dtext || []

    items.forEach((item) => {
        const node = document.createElement('div')
        node.className = 'sensor-node'
        node.id = `node-${item.params.param.iden}`

        // Зберігаємо дані в об'єкті елемента для тултіпа
        node._meta = item

        // Координати у %
        node.style.left = `${(parseInt(item.x) / origW) * 100}%`
        node.style.top = `${(parseInt(item.y) / origH) * 100}%`
        node.style.width = `${(parseInt(item.w) / origW) * 100}%`
        node.style.height = `${(parseInt(item.h) / origH) * 100}%`

        node.innerHTML = `<span class="s-value">${item.info.text}</span>`
        dynamicLayer.appendChild(node)
    })
}

// 4. Логіка Tooltip
dynamicLayer.addEventListener('mousemove', (e) => {
    const target = e.target.closest('.sensor-node')
    if (target) {
        const meta = target._meta
        tooltip.style.display = 'block'
        tooltip.style.left = `${e.clientX + 15}px`
        tooltip.style.top = `${e.clientY + 15}px`
        tooltip.innerHTML = `
            <div style="color:#60a5fa;font-weight:bold">${meta.params.param.iden}</div>
            <div style="font-size:11px;margin-top:4px">Одиниця: ${meta.params.param.mas}</div>
            <div style="font-size:11px">Значення: ${meta.info.text}</div>
        `
    } else {
        tooltip.style.display = 'none'
    }
})

dynamicLayer.addEventListener('mouseleave', () => (tooltip.style.display = 'none'))

// 5. WebSocket оновлення
const socket = new WebSocket(`ws://${window.location.host}`)
socket.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.event === 'IOS_UPDATE') {
        const payload = msg.data
        Object.keys(payload).forEach((iden) => {
            const el = document.querySelector(`#node-${iden} .s-value`)
            if (el) el.innerText = payload[iden]
        })
        timeEl.innerText = new Date().toLocaleTimeString()
    }
}

// Listeners
window.addEventListener('resize', () => {
    if (config) fitToScreen(parseInt(config.w), parseInt(config.h))
})

unitSelect.onchange = loadMonitor
fileSelect.onchange = loadMonitor

document.getElementById('fs-toggle').onclick = () => {
    const el = document.getElementById('monitor-wrapper')
    if (!document.fullscreenElement) el.requestFullscreen()
    else document.exitFullscreen()
}

loadMonitor()
