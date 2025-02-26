// Створення елемента з картинкою
const mapContainer = document.getElementById('mapContainer')
const mapImage = document.createElement('img')

mapImage.src = '../background-map.jpg' // Шлях до вашого зображення
mapImage.style.width = '100%' // Заповнити ширину контейнера
mapImage.style.height = '100%' // Заповнити висоту контейнера
mapImage.style.objectFit = 'cover' // Зберегти пропорції

// Додати картинку до контейнера
mapContainer.appendChild(mapImage)

// Додати інтерактивність (наприклад, клік на карті)
mapContainer.addEventListener('click', (event) => {
    const rect = mapContainer.getBoundingClientRect()
    const x = event.clientX - rect.left // Позиція кліка по X
    const y = event.clientY - rect.top // Позиція кліка по Y
    alert(`Клік на координатах: X=${x}, Y=${y}`)
})
