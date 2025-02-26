const mapContainer = document.getElementById('mapContainer')

// Додаткові змінні для перетягування
let isDragging = false
let startX, startY, initialX, initialY

// Додати обробник подій для початку перетягування
mapContainer.addEventListener('mousedown', (event) => {
    event.stopPropagation() // Зупинити подію, щоб не перетягувати карту
    isDragging = true
    startX = event.clientX
    startY = event.clientY
    initialX = mapContainer.offsetLeft // Початкова позиція X
    initialY = mapContainer.offsetTop // Початкова позиція Y
    mapContainer.style.cursor = 'grabbing' // Змінюємо курсор
})

// Додати обробник подій для руху миші
document.addEventListener('mousemove', (event) => {
    if (isDragging) {
        const dx = event.clientX - startX // Різниця по X
        const dy = event.clientY - startY // Різниця по Y
        mapContainer.style.left = `${initialX + dx}px`
        mapContainer.style.top = `${initialY + dy}px`
    }
})

// Додати обробник подій для закінчення перетягування
document.addEventListener('mouseup', () => {
    isDragging = false
    mapContainer.style.cursor = 'grab' // Повертаємо курсор
})

// Функція для створення маркера
function createMarker(x, y) {
    const marker = document.createElement('div')
    marker.className = 'marker'
    marker.style.left = `${x}px`
    marker.style.top = `${y}px`

    const infoWindow = document.createElement('div')
    infoWindow.className = 'info-window'
    infoWindow.innerText = 'Інформація про маркер'
    infoWindow.style.left = `${x + 10}px` // Зсув інформаційного вікна
    infoWindow.style.top = `${y - 20}px` // Зсув інформаційного вікна

    marker.appendChild(infoWindow)

    // Додати обробник події для відкриття інформаційного вікна
    marker.addEventListener('click', (event) => {
        event.stopPropagation() // Зупинити подію, щоб не закривати вікно
        infoWindow.style.display = infoWindow.style.display === 'block' ? 'none' : 'block'
    })

    mapContainer.appendChild(marker)
    mapContainer.appendChild(infoWindow)
}

// Додати обробник події для натискання на карті
mapContainer.addEventListener('click', (event) => {
    const rect = mapContainer.getBoundingClientRect()
    const x = event.clientX - rect.left // Позиція по X відносно карти
    const y = event.clientY - rect.top // Позиція по Y відносно карти

    createMarker(x, y)
})
