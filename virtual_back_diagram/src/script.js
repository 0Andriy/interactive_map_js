// document.addEventListener('DOMContentLoaded', () => {
const container = document.getElementById('diagram-container')
const canvas = document.getElementById('canvas-area')
const svgCanvas = document.getElementById('connector-canvas')
const elements = document.querySelectorAll('.diagram-element')
// Отримуємо посилання на конкретні елементи за ID
const element1 = document.getElementById('element1')
const element2 = document.getElementById('element2')

// Змінні для панорамування (залишаються як були)
let isDraggingCanvas = false
let startXCanvas
let startYCanvas
let currentX = 0
let currentY = 0

// Змінні для перетягування окремого елемента
let activeElement = null
let offsetXElement
let offsetYElement

// Зберігаємо точки маршруту (waypoints) окремо
let connectionWaypoints = [
    { id: 'p1', x: 0, y: 0, type: 'start' },
    { id: 'p2', x: 0, y: 0, type: 'mid' },
    { id: 'p3', x: 0, y: 0, type: 'mid' },
    { id: 'p4', x: 0, y: 0, type: 'end' },
]

// --- Логіка перетягування ОКРЕМИХ ЕЛЕМЕНТІВ ---

elements.forEach((element) => {
    element.addEventListener('mousedown', (e) => {
        // Зупиняємо "спливання" події до батьківського контейнера,
        // щоб не спрацювало панорамування фону
        e.stopPropagation()
        isDraggingCanvas = false // Вимикаємо панорамування

        activeElement = element
        // Розраховуємо зміщення миші відносно елемента
        offsetXElement = e.clientX - element.getBoundingClientRect().left
        offsetYElement = e.clientY - element.getBoundingClientRect().top

        // Додаємо клас, щоб змінити курсор на елементі
        element.style.cursor = 'grabbing'
    })
})

// --- Логіка панорамування ФОНУ (модифікована) ---

container.addEventListener('mousedown', (e) => {
    // Якщо ми вже тягнемо елемент, не починаємо тягнути фон
    if (activeElement) return

    isDraggingCanvas = true
    container.classList.add('is-dragging')
    startXCanvas = e.clientX - currentX
    startYCanvas = e.clientY - currentY
    e.preventDefault()
})

// --- Загальні події руху та відпускання миші ---

window.addEventListener('mouseup', () => {
    isDraggingCanvas = false
    if (activeElement) {
        activeElement.style.cursor = 'grab'
        activeElement = null
    }
    container.classList.remove('is-dragging')
})

window.addEventListener('mousemove', (e) => {
    // 1. Обробка переміщення ОКРЕМОГО ЕЛЕМЕНТА
    if (activeElement) {
        // Важливо: ми позиціонуємо елемент відносно СКРОЛУ (canvas-area),
        // а не екрана. Тому треба врахувати поточне зміщення фону (currentX/Y).

        const newX = e.clientX - offsetXElement - currentX
        const newY = e.clientY - offsetYElement - currentY

        activeElement.style.left = `${newX}px`
        activeElement.style.top = `${newY}px`

        // Оновлюємо лінії після переміщення елемента
        updateConnection(element1, element2, 'line1-2')

        return // Зупиняємо подальшу обробку, якщо рухаємо елемент
    }

    // 2. Обробка панорамування ФОНУ
    if (!isDraggingCanvas) return

    currentX = e.clientX - startXCanvas
    currentY = e.clientY - startYCanvas

    canvas.style.transform = `translate(${currentX}px, ${currentY}px) scale(1)`

    // Оновлюємо лінії після панорамування всього полотна
    updateConnection(element1, element2, 'line1-2')
})

// // --- Функція малювання/оновлення лінії ---
// function updateConnection(el1, el2, lineId) {
//     // Отримуємо позиції елементів відносно canvas-area (нашого полотна)
//     const r1 = el1.getBoundingClientRect();
//     const r2 = el2.getBoundingClientRect();
//     const canvasRect = canvas.getBoundingClientRect();

//     // Обчислюємо центри елементів у системі координат полотна
//     const x1 = r1.left + r1.width / 2 - canvasRect.left;
//     const y1 = r1.top + r1.height / 2 - canvasRect.top;
//     const x2 = r2.left + r2.width / 2 - canvasRect.left;
//     const y2 = r2.top + r2.height / 2 - canvasRect.top;

//     // Знаходимо або створюємо SVG-лінію
//     let line = document.getElementById(lineId);
//     if (!line) {
//         line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
//         line.id = lineId;
//         line.setAttribute('stroke', 'red');
//         line.setAttribute('stroke-width', 2);
//         svgCanvas.appendChild(line);
//     }

//     // Встановлюємо нові координати лінії
//     line.setAttribute('x1', x1);
//     line.setAttribute('y1', y1);
//     line.setAttribute('x2', x2);
//     line.setAttribute('y2', y2);
// }

// --- Функція малювання/оновлення ортогональної лінії (SVG Path) ---
function updateConnection(el1, el2, pathId) {
    const r1 = el1.getBoundingClientRect()
    const r2 = el2.getBoundingClientRect()
    const canvasRect = canvas.getBoundingClientRect()

    // Обчислюємо центри елементів у системі координат полотна
    const x1 = r1.left + r1.width / 2 - canvasRect.left
    const y1 = r1.top + r1.height / 2 - canvasRect.top
    const x2 = r2.left + r2.width / 2 - canvasRect.left
    const y2 = r2.top + r2.height / 2 - canvasRect.top

    // Знаходимо або створюємо SVG-path
    let path = document.getElementById(pathId)
    if (!path) {
        path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.id = pathId
        path.setAttribute('stroke', 'red')
        path.setAttribute('stroke-width', 2)
        path.setAttribute('fill', 'none')
        svgCanvas.appendChild(path)
    }

    // Побудова шляху з одним "ліктем" посередині (спрощено)
    // Ми рухаємося горизонтально до середини шляху, потім вертикально
    const midX = (x1 + x2) / 2
    // SVG path data: M (move to), L (line to)
    const pathData = `M ${x1},${y1} L ${midX},${y1} L ${midX},${y2} L ${x2},${y2}`

    // Або простіший варіант (два сегменти):
    // const pathData = `M ${x1},${y1} L ${x2},${y1} L ${x2},${y2}`;

    path.setAttribute('d', pathData)
}

// // Функція оновлення ортогональної лінії
// function updateConnection(el1, el2, pathId) {
//     const r1 = el1.getBoundingClientRect();
//     const r2 = el2.getBoundingClientRect();
//     const canvasRect = canvas.getBoundingClientRect();

//     // Оновлюємо початкову та кінцеву точки на основі положення блоків
//     connectionWaypoints[0].x = r1.left + r1.width / 2 - canvasRect.left;
//     connectionWaypoints[0].y = r1.top + r1.height / 2 - canvasRect.top;
//     connectionWaypoints[3].x = r2.left + r2.width / 2 - canvasRect.left;
//     connectionWaypoints[3].y = r2.top + r2.height / 2 - canvasRect.top;

//     // Якщо проміжні точки ще не задані користувачем, обчислюємо їх автоматично
//     if (connectionWaypoints[1].x === 0 && connectionWaypoints[1].y === 0) {
//        const midX = (connectionWaypoints[0].x + connectionWaypoints[3].x) / 2;
//        connectionWaypoints[1].x = midX;
//        connectionWaypoints[1].y = connectionWaypoints[0].y;
//        connectionWaypoints[2].x = midX;
//        connectionWaypoints[2].y = connectionWaypoints[3].y;
//     }

//     let path = document.getElementById(pathId);
//     if (!path) {
//         path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
//         path.id = pathId;
//         path.setAttribute('stroke', 'red');
//         path.setAttribute('stroke-width', 2);
//         path.setAttribute('fill', 'none');
//         svgCanvas.appendChild(path);
//     }

//     // Формуємо рядок атрибута 'd' з масиву точок
//     const pathData = `M ${connectionWaypoints[0].x},${connectionWaypoints[0].y} ` +
//                      `L ${connectionWaypoints[1].x},${connectionWaypoints[1].y} ` +
//                      `L ${connectionWaypoints[2].x},${connectionWaypoints[2].y} ` +
//                      `L ${connectionWaypoints[3].x},${connectionWaypoints[3].y}`;

//     path.setAttribute('d', pathData);
//     // ... (додавання обробників подій для точок/ліній тут) ...
// }

// Ініціалізуємо початкове положення лінії при завантаженні
updateConnection(element1, element2, 'line1-2')
// });
