const container = document.querySelector("#map-container")
const map = document.querySelector("#map")
let isDragging = false
let startX, startY, offsetX = 0, offsetY = 0, scale = 0.6
let prevContainerWidth = container.clientWidth
let prevContainerHeight = container.clientHeight



function updateTransform() {
    map.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
}


function centerImageOnLoad () {
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight
    const imageWidth = map.clientWidth * scale
    const imageHeight = map.clientHeight * scale

    // Центруємо картинку
    offsetX = (containerWidth - imageWidth) / 2
    offsetY = (containerHeight - imageHeight) / 2

    map.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
}


window.addEventListener("load", centerImageOnLoad)



function adjustPositionOnResize(prevWidth, prevHeight) {
    const newWidth = container.clientWidth
    const newHeight = container.clientHeight

    const centerX = (newWidth / prevWidth) * (offsetX + prevWidth / 2) - newWidth / 2
    const centerY = (newHeight / prevHeight) * (offsetY + prevHeight / 2) - newHeight / 2

    offsetX = centerX
    offsetY = centerY

    map.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
}


window.addEventListener("resize", () => {
    const prevContainerWidth = container.clientWidth
    const prevContainerHeight = container.clientHeight

    adjustPositionOnResize(prevContainerWidth, prevContainerHeight)
})


// Переміщення карти
container.addEventListener("mousedown", (event) => {
    isDragging = true

    startX = event.clientX - offsetX
    startY = event.clientY - offsetY

    container.style.cursor = "grabbing"
})



window.addEventListener("mousemove", (event) => {
    if (!isDragging) return 

    offsetX = event.clientX - startX
    offsetY = event.clientY - startY

    map.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
})


window.addEventListener("mouseup", (event) => {
    isDragging = false

    container.style.cursor = "grab"
})

// Збільшення / Зменшення карти (Zoom) 
container.addEventListener("wheel", (event) => {
    event.preventDefault()

    const zoomSpeed = 0.1
    let newScale = scale * (event.deltaY > 0 ? 1 - zoomSpeed : 1 + zoomSpeed)
    newScale = Math.max(newScale, 0.1)

    // Координати миші
    const rect = container.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top

    // Обчислюємо новий зсув, щоб центр маштабування був під мишею
    offsetX -= (mouseX - offsetX) * (newScale / scale - 1)
    offsetY -= (mouseY - offsetY) * (newScale / scale - 1)

    scale = newScale

    map.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
}, { passive: false })



