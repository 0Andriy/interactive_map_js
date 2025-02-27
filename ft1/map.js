class InteractiveMap {
    constructor(containerId, imageUrl) {
        this.container = document.getElementById(containerId)
        this.mapWrapper = this.container.querySelector('#map-wrapper')
        this.imageUrl = imageUrl
        this.map = null
        this.markers = []

        // Початкові координати і масштаб
        this.currentX = 0
        this.currentY = 0
        this.scale = 1
        this.isDragging = false
        this.startX = 0
        this.startY = 0
        this.lastTouchDistance = null

        this.init()
    }

    init() {
        // Створюємо зображення карти
        this.map = document.createElement('img')
        this.map.src = this.imageUrl
        this.map.classList.add('map-image')
        this.map.ondragstart = () => false // Вимикаємо стандартне перетягування зображень

        // Додаємо карту в обгортку
        this.mapWrapper.appendChild(this.map)

        // Додаємо події
        this.addDragEvents()
        this.addZoomEvents()
        this.addControlButtons()
        this.addClickEvent()
    }

    addDragEvents() {
        this.mapWrapper.addEventListener('mousedown', (e) => this.startDrag(e))
        window.addEventListener('mousemove', (e) => this.drag(e))
        window.addEventListener('mouseup', () => this.stopDrag())

        // Сенсорні пристрої
        this.mapWrapper.addEventListener('touchstart', (e) => this.startDrag(e.touches[0]))
        window.addEventListener('touchmove', (e) => this.drag(e.touches[0]))
        window.addEventListener('touchend', () => this.stopDrag())
    }

    addZoomEvents() {
        this.mapWrapper.addEventListener('wheel', (e) => this.zoom(e))

        // Сенсорне масштабування (pinch-жест)
        this.mapWrapper.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                this.handleTouchZoom(e)
            }
        })
    }

    addControlButtons() {
        // const zoomInBtn = document.createElement('button')
        // zoomInBtn.innerText = '+'
        // zoomInBtn.classList.add('zoom-button')
        const zoomInBtn = document.querySelector('#zoom-in')
        zoomInBtn.addEventListener('click', () => this.zoomManual(1.2))

        // const zoomOutBtn = document.createElement('button')
        // zoomOutBtn.innerText = '-'
        // zoomOutBtn.classList.add('zoom-button')
        const zoomOutBtn = document.querySelector('#zoom-out')
        zoomOutBtn.addEventListener('click', () => this.zoomManual(0.8))

        // this.container.appendChild(zoomInBtn)
        // this.container.appendChild(zoomOutBtn)
    }

    addClickEvent() {
        this.mapWrapper.addEventListener('click', (e) => {
            if (e.target.classList.contains('marker')) return // Уникнення натискання на мітку

            const rect = this.mapWrapper.getBoundingClientRect()
            const x = (e.clientX - rect.left - this.currentX) / this.scale
            const y = (e.clientY - rect.top - this.currentY) / this.scale
            console.log(`Координати: x=${x}, y=${y}`)
            this.addMarker(x, y)
        })
    }

    startDrag(e) {
        this.isDragging = true
        this.startX = e.clientX - this.currentX
        this.startY = e.clientY - this.currentY
        this.mapWrapper.style.cursor = 'grabbing'
    }

    drag(e) {
        if (!this.isDragging) return
        this.currentX = e.clientX - this.startX
        this.currentY = e.clientY - this.startY
        this.updateTransform()
    }

    stopDrag() {
        this.isDragging = false
        this.mapWrapper.style.cursor = 'grab'
    }

    zoom(e) {
        e.preventDefault()
        const scaleStep = 0.1
        let zoomFactor = e.deltaY < 0 ? 1 + scaleStep : 1 - scaleStep
        this.applyZoom(zoomFactor, e.clientX, e.clientY)
    }

    zoomManual(factor) {
        const rect = this.mapWrapper.getBoundingClientRect()
        this.applyZoom(factor, rect.width / 2, rect.height / 2)
    }

    applyZoom(factor, zoomX, zoomY) {
        const prevScale = this.scale
        this.scale *= factor

        // Отримуємо координати точки миші відносно контейнера
        const rect = this.mapWrapper.getBoundingClientRect()
        const mouseX = zoomX - rect.left
        const mouseY = zoomY - rect.top

        // Коригуємо зміщення, щоб точка під курсором залишалася на місці
        this.currentX -= (mouseX - this.currentX) * (factor - 1)
        this.currentY -= (mouseY - this.currentY) * (factor - 1)

        this.updateTransform()
    }

    handleTouchZoom(e) {
        let touch1 = e.touches[0]
        let touch2 = e.touches[1]
        let currentDistance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY,
        )

        if (this.lastTouchDistance) {
            let zoomFactor = currentDistance / this.lastTouchDistance
            this.applyZoom(
                zoomFactor,
                this.mapWrapper.clientWidth / 2,
                this.mapWrapper.clientHeight / 2,
            )
        }
        this.lastTouchDistance = currentDistance
    }

    addMarker(x, y) {
        const marker = document.createElement('div')
        marker.classList.add('marker')
        marker.style.left = `${x * this.scale + this.currentX}px`
        marker.style.top = `${y * this.scale + this.currentY}px`
        marker.dataset.x = x
        marker.dataset.y = y
        this.mapWrapper.appendChild(marker)
        this.markers.push(marker)
    }

    updateTransform() {
        this.map.style.transform = `translate(${this.currentX}px, ${this.currentY}px) scale(${this.scale})`

        // Оновлення позицій міток
        this.markers.forEach((marker) => {
            const x = parseFloat(marker.dataset.x) * this.scale + this.currentX
            const y = parseFloat(marker.dataset.y) * this.scale + this.currentY
            marker.style.left = `${x}px`
            marker.style.top = `${y}px`
        })
    }
}

// Запускаємо карту
document.addEventListener('DOMContentLoaded', () => {
    new InteractiveMap('map-container', '../background-map.jpg')
})
