const unitSelect = document.getElementById('select-unit')
const fileSelect = document.getElementById('select-file')
const canvas = document.getElementById('canvas-area')
const bgImage = document.getElementById('bg-image')
const dynamicLayer = document.getElementById('dynamic-layer')

let currentConfig = null

async function loadScheme() {
    const unitId = unitSelect.value
    const fileName = fileSelect.value

    // 1. Завантажуємо JSON конфігурацію (fragment info)
    // Припускаємо, що ваш API повертає структуру, яку ви надали
    try {
        const response = await fetch(
            `/api/v1/ios/fragment/xml/${unitId}?fileName=${fileName.replace('.png', '.xml')}`,
        )
        const data = await response.json()
        currentConfig = data.fragment

        // 2. Встановлюємо пропорції контейнера на основі w та h з JSON
        const aspect = (currentConfig.h / currentConfig.w) * 100
        canvas.style.paddingBottom = `${aspect}%`
        canvas.style.width = '100%' // Розтягуємо по ширині в'юпорта

        // 3. Завантажуємо картинку
        bgImage.src = `/api/v1/ios/fragment/png/${unitId}?fileName=${fileName}`

        renderElements()
    } catch (err) {
        console.error('Помилка завантаження схеми:', err)
    }
}

function renderElements() {
    dynamicLayer.innerHTML = ''
    const { dtext } = currentConfig.dynamic
    const origW = parseInt(currentConfig.w)
    const origH = parseInt(currentConfig.h)

    dtext.forEach((item) => {
        const el = document.createElement('div')
        el.className = 'sensor-box'
        el.id = `sensor-${item.params.param.iden}`

        // Розрахунок координат у % відносно оригінального розміру
        const left = (parseInt(item.x) / origW) * 100
        const top = (parseInt(item.y) / origH) * 100
        const width = (parseInt(item.w) / origW) * 100
        const height = (parseInt(item.h) / origH) * 100

        el.style.cssText = `
            left: ${left}%;
            top: ${top}%;
            width: ${width}%;
            height: ${height}%;
        `

        el.innerHTML = `
            <div class="sensor-value">${item.info.text}</div>
            <div class="sensor-unit">${item.params.param.mas}</div>
        `

        dynamicLayer.appendChild(el)
    })
}

// Слухаємо зміни у випадаючих списках
unitSelect.onchange = loadScheme
fileSelect.onchange = loadScheme

// Початкове завантаження
loadScheme()
