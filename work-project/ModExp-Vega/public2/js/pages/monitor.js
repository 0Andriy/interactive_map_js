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

// /**
//  * Вписуємо схему у видиму область (Fit-to-Screen)
//  */
// function fitToScreen() {
//     if (!config) return

//     const origW = parseInt(config.w)
//     const origH = parseInt(config.h)

//     const viewW = viewport.clientWidth - 40
//     const viewH = viewport.clientHeight - 40

//     const scale = Math.min(viewW / origW, viewH / origH)

//     canvasArea.style.width = `${origW * scale}px`
//     canvasArea.style.height = `${origH * scale}px`
// }

/**
 * Спрощена адаптація: просто дозволяємо контейнеру бути 100% від в'юпорта
 */
function fitToScreen() {
    // Контейнер тепер завжди 100% ширини та висоти в'юпорта через CSS.
    // Нам не потрібно вручну вираховувати scale, якщо ми допускаємо деформацію.
    canvasArea.style.width = '100%'
    canvasArea.style.height = '100%'
}

/**
 * Рендеринг датчиків
 */
function renderNodes() {
    dynamicLayer.innerHTML = ''
    if (!config || !config.dynamic) return

    const origW = parseInt(config.w)
    const origH = parseInt(config.h)
    const items = [...(config.dynamic.dtext || []), ...(config.dynamic.hist || [])]

    items.forEach((item) => {
        const node = document.createElement('div')
        node.className = 'sensor-node'
        node.id = `node-${item.params.param.iden}`
        node._meta = item

        // Розрахунок координат у % (прив'язка до лівого верхнього кута)
        const xPercent = (parseInt(item.x) / origW) * 100
        const yPercent = (parseInt(item.y) / origH) * 100
        const wPercent = (parseInt(item.w) / origW) * 100
        const hPercent = (parseInt(item.h) / origH) * 100

        node.style.left = `${xPercent}%`
        node.style.top = `${yPercent}%`

        // Встановлюємо мінімальні розміри з конфігу
        // node.style.width = `${wPercent}%`
        node.style.height = `${hPercent}%`

        // Перевіряємо, чи є в елемента графічні властивості (img)
        if (item.img && item.img.type === 'O') {
            node.className = 'sensor-node graphical'
            if (item.img.dir === 'H') {
                node.classList.add('horizontal')
            }

            // Додаємо шар заповнення
            node.innerHTML = `<div class="fill-level"></div>`
        } else {
            node.className = 'sensor-node'
            node.innerHTML = `<span class="s-value">0</span>`
        }

        dynamicLayer.appendChild(node)
    })
}

/**
 * Перевірка та виправлення розміру, якщо текст не влізає
 * Дозволяє блоку рости вправо/вниз, не змінюючи координату x/y
 */
function adjustNodeSize(node) {
    const valEl = node.querySelector('.s-value')
    if (!valEl) return

    // Якщо текст фізично ширший за блок
    if (valEl.scrollWidth > node.clientWidth) {
        node.style.width = 'auto'
        node.style.minWidth = `${(parseInt(node._meta.w) / parseInt(config.w)) * 100}%`
        node.style.paddingRight = '8px' // запас
        node.style.zIndex = '100' // піднімаємо над іншими
    } else {
        node.style.zIndex = '10'
    }
}

/**
 * Опитування реальних даних (JSON POST)
 */
async function fetchRealtimeData() {
    if (!config) return

    const unitId = unitSelect.value
    const nodes = document.querySelectorAll('.sensor-node')
    if (nodes.length === 0) return

    const idenList = Array.from(nodes).map((node) => node._meta.params.param.iden)

    try {
        const response = await fetch(`/api/v1/ios/value/${unitId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
 * Оновлення значень в DOM
 */
function updateSensorsUI(data) {
    const params = data?.paramslist?.param
    if (!Array.isArray(params)) return

    params.forEach((item) => {
        const { iden, valuetext, value } = item
        const node = document.getElementById(`node-${iden}`)

        if (node) {
            // 1. Оновлення Тексту (якщо це текстовий вузол)
            const valEl = node.querySelector('.s-value')
            if (valEl && valEl.innerText !== String(valuetext)) {
                valEl.innerText = valuetext

                // Анімація кольору
                valEl.style.color = '#fbbf24'
                setTimeout(() => (valEl.style.color = ''), 500)

                // Коригуємо розмір після зміни тексту
                adjustNodeSize(node)
            }

            // 2. Оновлення Графіки (якщо це прямокутник)
            const fillEl = node.querySelector('.fill-level')
            if (fillEl && node._meta.img) {
                const img = node._meta.img
                const min = parseFloat(img.pred_n || 0)
                const max = parseFloat(img.pred_v || 100)
                const current = parseFloat(value || 0)

                // Розрахунок відсотка
                let percent = ((current - min) / (max - min)) * 100
                percent = Math.min(Math.max(percent, 0), 100) // обмежуємо 0-100

                // if (img.filltype === 'S') {
                //     // ЯКЩО МАЄ БУТИ НАВПАКИ (наприклад, 100% - це порожньо)
                //     percent = 100 - percent // Розкоментуйте, якщо треба інвертувати рух
                // }

                if (img.dir === 'V') {
                    fillEl.style.height = `${percent}%`
                } else {
                    fillEl.style.width = `${percent}%`
                }
            }
        }
    })

    const info = data?.infoslist?.info
    if (Array.isArray(info) && info.length > 0) {
        const serverTime = info[0].datetime
        if (timeEl && serverTime) {
            timeEl.innerText = serverTime
        }
    }
}

/**
 * Завантаження схеми
 */
async function loadMonitor() {
    if (pollingInterval) clearInterval(pollingInterval)

    const unitId = unitSelect.value
    if (!unitId) {
        console.log('Блок ще не обрано')
        return // Виходимо, щоб не робити пустий запит до API
    }
    const fileName = fileSelect.value
    if (!fileName) {
        console.log('Фрагмент ще не обрано')
        return // Виходимо, щоб не робити пустий запит до API
    }

    const xmlName = fileName.replace('.png', '.xml')

    try {
        const res = await fetch(`/api/v1/ios/fragment/xml/${unitId}?fileName=${xmlName}`)
        const data = await res.json()

        config = data.fragment

        fitToScreen()
        bgLayer.src = `/api/v1/ios/fragment/png/${unitId}?fileName=${fileName}`

        renderNodes()

        fetchRealtimeData()
        // Опитування раз на 5 секунд (згідно твого коду)
        pollingInterval = setInterval(fetchRealtimeData, 5000)
    } catch (err) {
        console.error('Monitor Initialization Error:', err)
        timeEl.innerText = "Помилка зв'язку"
    }
}

/**
 * Логіка тултіпа
 */
function initTooltip() {
    dynamicLayer.addEventListener('mousemove', (e) => {
        const target = e.target.closest('.sensor-node')
        if (target) {
            const meta = target._meta
            tooltip.style.display = 'block'
            tooltip.style.left = `${e.clientX + 15}px`
            tooltip.style.top = `${e.clientY + 15}px`

            // Підсвічуємо активний датчик через z-index
            target.style.zIndex = '1000'

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

    dynamicLayer.addEventListener('mouseout', (e) => {
        const target = e.target.closest('.sensor-node')
        if (target) {
            // Повертаємо стандартний z-index при відведенні миші
            adjustNodeSize(target)
        }
    })

    dynamicLayer.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none'
    })
}

/**
 * Події
 */
unitSelect.onchange = loadMonitor
fileSelect.onchange = loadMonitor

window.addEventListener('resize', fitToScreen)

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

initTooltip()
loadMonitor()
