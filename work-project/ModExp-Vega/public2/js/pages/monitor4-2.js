/**
 * Monitor.js - Клієнтська логіка SCADA-панелі
 */

const unitSelect = document.getElementById('select-unit')
const fileSelect = document.getElementById('select-file')
const viewport = document.getElementById('monitor-viewport')
const canvasArea = document.getElementById('canvas-area')
const bgLayer = document.getElementById('bg-layer')
const dynamicLayer = document.getElementById('dynamic-layer')
const tooltip = document.getElementById('global-tooltip')
const timeEl = document.getElementById('update-time')
const fsToggle = document.getElementById('fs-toggle')

let config = null
let pollingInterval = null

/**
 * Вписуємо схему у видиму область (Fit-to-Screen)
 * Розраховує масштаб так, щоб не було скролів
 */
function fitToScreen() {
    if (!config) return

    const origW = parseInt(config.w)
    const origH = parseInt(config.h)

    // Віднімаємо падінги в'юпорта
    const viewW = viewport.clientWidth - 40
    const viewH = viewport.clientHeight - 40

    // Знаходимо мінімальний коефіцієнт стиснення
    const scale = Math.min(viewW / origW, viewH / origH)

    // Встановлюємо фізичні розміри контейнера
    canvasArea.style.width = `${origW * scale}px`
    canvasArea.style.height = `${origH * scale}px`
}

/**
 * Рендеринг датчиків на основі отриманого конфігу
 */
function renderNodes() {
    dynamicLayer.innerHTML = ''
    if (!config || !config.dynamic) return

    const origW = parseInt(config.w)
    const origH = parseInt(config.h)
    const items = config.dynamic.dtext || []

    items.forEach((item) => {
        const node = document.createElement('div')
        node.className = 'sensor-node'
        node.id = `node-${item.params.param.iden}`

        // Зберігаємо метадані об'єкта прямо в DOM-вузлі для тултіпа
        node._meta = item

        // Розрахунок координат та розмірів у % відносно оригіналу
        const xPercent = (parseInt(item.x) / origW) * 100
        const yPercent = (parseInt(item.y) / origH) * 100
        const wPercent = (parseInt(item.w) / origW) * 100
        const hPercent = (parseInt(item.h) / origH) * 100

        node.style.left = `${xPercent}%`
        node.style.top = `${yPercent}%`
        node.style.width = `${wPercent}%`
        node.style.height = `${hPercent}%`

        // Основне виведення - тільки початковий текст (0.0)
        // node.innerHTML = `<span class="s-value">${item.info.text}</span>`
        node.innerHTML = `<span class="s-value">0</span>`

        dynamicLayer.appendChild(node)
    })
}

/**
 * Опитування реальних даних (Polling)
 */
async function fetchRealtimeData() {
    if (!config) return

    const unitId = unitSelect.value
    const nodes = document.querySelectorAll('.sensor-node')
    if (nodes.length === 0) return

    // Формуємо список ідентифікаторів: кожен з нового рядка
    const idenList = Array.from(nodes).map((node) => node._meta.params.param.iden)
    // .join('\n')

    try {
        const response = await fetch(`/api/v1/ios/value/${unitId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ids: idenList }),
        })

        if (!response.ok) throw new Error('Network error')

        const data = await response.json()
        updateSensorsUI(data)
    } catch (err) {
        console.error('Data update error:', err)
    }
}

/**
 * Форматування дати у вигляд: 16.04.2026 09:50:57.811
 */
function formatTimestamp(date) {
    const pad = (n, m = 2) => String(n).padStart(m, '0')

    const d = pad(date.getDate())
    const mo = pad(date.getMonth() + 1)
    const y = date.getFullYear()
    const h = pad(date.getHours())
    const mi = pad(date.getMinutes())
    const s = pad(date.getSeconds())
    const ms = pad(date.getMilliseconds(), 3)

    return `${d}.${mo}.${y} ${h}:${mi}:${s}.${ms}`
}

/**
 * Оновлення значень в DOM
 */
function updateSensorsUI(data) {
    // Перевіряємо, чи є в даних потрібна структура
    const params = data?.paramslist?.param
    if (!Array.isArray(params)) return

    params.forEach((item) => {
        const { iden, valuetext } = item
        const node = document.getElementById(`node-${iden}`)

        if (node) {
            const valEl = node.querySelector('.s-value')

            // Використовуємо valuetext для відображення
            if (valEl && valEl.innerText !== String(valuetext)) {
                valEl.innerText = valuetext

                // Легке підсвічування при зміні
                valEl.style.color = '#fbbf24'
                setTimeout(() => (valEl.style.color = ''), 500)
            }
        }
    })

    // 2. Оновлюємо час із даних відповіді (infoslist -> info -> datetime)
    const info = data?.infoslist?.info
    if (Array.isArray(info) && info.length > 0) {
        const serverTime = info[0].datetime // Беремо час із першого об'єкта
        if (timeEl && serverTime) {
            timeEl.innerText = serverTime
        }
    }
}

/**
 * Завантаження схеми (JSON + PNG)
 */
async function loadMonitor() {
    // Зупиняємо попереднє опитування
    if (pollingInterval) clearInterval(pollingInterval)

    const unitId = unitSelect.value
    const fileName = fileSelect.value
    const xmlName = fileName.replace('.png', '.xml')

    try {
        const res = await fetch(`/api/v1/ios/fragment/xml/${unitId}?fileName=${xmlName}`)
        const data = await res.json()

        config = data.fragment

        fitToScreen()
        bgLayer.src = `/api/v1/ios/fragment/png/${unitId}?fileName=${fileName}`

        renderNodes()

        // Запускаємо опитування раз на 2 секунди
        fetchRealtimeData()
        pollingInterval = setInterval(fetchRealtimeData, 5000)
    } catch (err) {
        console.error('Monitor Initialization Error:', err)
        timeEl.innerText = "Помилка зв'язку"
    }
}

/**
 * Ініціалізація логіки тултіпа
 */
function initTooltip() {
    dynamicLayer.addEventListener('mousemove', (e) => {
        const target = e.target.closest('.sensor-node')
        if (target) {
            const meta = target._meta
            tooltip.style.display = 'block'
            tooltip.style.left = `${e.clientX + 15}px`
            tooltip.style.top = `${e.clientY + 15}px`
            tooltip.innerHTML = `
                <div style="color:#60a5fa; font-weight:bold; margin-bottom:4px">
                    ${meta.params.param.iden}
                </div>
                <div style="font-size:11px; color:#94a3b8">
                    Одиниці: <b>${meta.params.param.mas}</b>
                </div>
                <div style="font-size:11px; margin-top:2px">
                    Опис: ${meta.info.text || 'Параметр'}
                </div>
            `
        } else {
            tooltip.style.display = 'none'
        }
    })

    dynamicLayer.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none'
    })
}

/**
 * Події
 */

// Зміна об'єкта або файлу
unitSelect.onchange = loadMonitor
fileSelect.onchange = loadMonitor

// Адаптація при зміні розміру вікна
window.addEventListener('resize', fitToScreen)

// Повний екран
fsToggle.onclick = () => {
    const wrapper = document.getElementById('monitor-wrapper')
    if (!document.fullscreenElement) {
        wrapper.requestFullscreen()
        fsToggle.innerText = '✕ Вийти'
    } else {
        document.exitFullscreen()
        fsToggle.innerText = '⛶ Повний екран'
    }
}

// Запуск при завантаженні сторінки
initTooltip()
loadMonitor()
