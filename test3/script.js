const mapContainer = document.getElementById('mapContainer')

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

    // Додати обробник події для перетягування маркера
    marker.draggable = true
    marker.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', null) // Для Chrome
        marker.classList.add('dragging')
    })

    marker.addEventListener('dragend', () => {
        marker.classList.remove('dragging')
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
