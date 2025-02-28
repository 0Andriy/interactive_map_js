class InteractiveMap {
    constructor(containerId, imageUrl) {
        this.container = document.getElementById(containerId);
        this.mapWrapper = this.container.querySelector('#map-wrapper');
        this.imageUrl = imageUrl;
        this.map = null;

        // Початкові параметри
        this.currentX = 0;
        this.currentY = 0;
        this.scale = 1;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.markers = [];

        this.init();
    }

    init() {
        this.map = document.createElement('img');
        this.map.src = this.imageUrl;
        this.map.classList.add('map-image');
        this.map.ondragstart = () => false;

        this.mapWrapper.appendChild(this.map);

        this.addDragEvents();
        this.addZoomEvents();

        this.centerMap();
        window.addEventListener('resize', () => this.centerMap());

        this.mapWrapper.addEventListener('click', (e) => this.addMarker(e));
    }

    addDragEvents() {
        this.mapWrapper.addEventListener('mousedown', (e) => this.startDrag(e));
        window.addEventListener('mousemove', (e) => this.drag(e));
        window.addEventListener('mouseup', () => this.stopDrag());
    }

    addZoomEvents() {
        this.mapWrapper.addEventListener('wheel', (e) => this.zoom(e));
    }

    startDrag(e) {
        this.isDragging = true;
        this.startX = e.clientX - this.currentX;
        this.startY = e.clientY - this.currentY;
        this.mapWrapper.style.cursor = 'grabbing';
    }

    drag(e) {
        if (!this.isDragging) return;
        this.currentX = e.clientX - this.startX;
        this.currentY = e.clientY - this.startY;
        this.updateTransform();
    }

    stopDrag() {
        this.isDragging = false;
        this.mapWrapper.style.cursor = 'grab';
    }

    zoom(e) {
        e.preventDefault();
        const scaleStep = 0.1;
        let zoomFactor = e.deltaY < 0 ? 1 + scaleStep : 1 - scaleStep;

        let newScale = this.scale * zoomFactor;

        // Отримуємо координати точки миші відносно контейнера
        const rect = this.mapWrapper.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        this.currentX -= (mouseX - this.currentX) * (zoomFactor - 1);
        this.currentY -= (mouseY - this.currentY) * (zoomFactor - 1);

        this.scale = newScale;
        this.updateTransform();
    }

    updateTransform() {
        this.map.style.transform = `translate(${this.currentX}px, ${this.currentY}px) scale(${this.scale})`;

        // Оновлюємо позиції маркерів
        this.markers.forEach(marker => {
            marker.style.transform = `translate(${this.currentX}px, ${this.currentY}px) scale(${this.scale})`;
        });
    }

    centerMap() {
        const containerRect = this.container.getBoundingClientRect();
        const mapRect = this.map.getBoundingClientRect();

        this.scale = Math.min(
            containerRect.width / mapRect.width,
            containerRect.height / mapRect.height
        );

        this.currentX = (containerRect.width - mapRect.width * this.scale) / 2;
        this.currentY = (containerRect.height - mapRect.height * this.scale) / 2;

        this.updateTransform();
    }

    addMarker(e) {
        if (this.isDragging) return; // Уникнення додавання маркерів при перетягуванні

        const marker = document.createElement('div');
        marker.classList.add('map-marker');
        marker.style.left = `${e.clientX}px`;
        marker.style.top = `${e.clientY}px`;
        this.mapWrapper.appendChild(marker);

        this.markers.push(marker);
        this.addMarkerDragEvents(marker);
    }

    addMarkerDragEvents(marker) {
        let isDraggingMarker = false;
        let offsetX, offsetY;

        marker.addEventListener('mousedown', (e) => {
            isDraggingMarker = true;
            offsetX = e.clientX - marker.offsetLeft;
            offsetY = e.clientY - marker.offsetTop;
            e.stopPropagation();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDraggingMarker) return;
            marker.style.left = `${e.clientX - offsetX}px`;
            marker.style.top = `${e.clientY - offsetY}px`;
        });

        window.addEventListener('mouseup', () => {
            isDraggingMarker = false;
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new InteractiveMap('map-container', '../background-map.jpg');
});
