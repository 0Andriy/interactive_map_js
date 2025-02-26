const mapContainer = document.getElementById('mapContainer')
const marker = document.getElementById('marker')

// Додати обробник події для натискання на карті
mapContainer.addEventListener('click', (event) => {
    const rect = mapContainer.getBoundingClientRect()
    const x = event.clientX - rect.left // Позиція по X відносно карти
    const y = event.clientY - rect.top // Позиція по Y відносно карти

    // Встановити позицію маркера
    marker.style.left = `${x}px`
    marker.style.top = `${y}px`
    marker.style.display = 'block' // Показати маркер
})
