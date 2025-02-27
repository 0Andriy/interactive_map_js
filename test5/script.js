// // Створення елемента з картинкою
// const mapContainer = document.getElementById('mapContainer')
// const mapImage = document.createElement('img')

// mapImage.src = '../background-map.jpg' // Шлях до вашого зображення
// mapImage.id = 'mapImage' // Додати ID для стилізації

// // Додати картинку до контейнера
// mapContainer.appendChild(mapImage)


// // Змінні для перетягування
// let isDragging = false
// let startX, startY
// let scrollX = 0
// let scrollY = 0
// let scale = 1 // Масштаб зображення

// // Події миші для перетягування
// function startDragging(event) {
//     isDragging = true
//     startX = event.clientX // Позиція миші по X
//     startY = event.clientY // Позиція миші по Y
//     mapImage.style.cursor = 'grabbing' // Змінити курсор на "перетягування"
//     mapContainer.style.cursor = 'grabbing' // Змінити курсор на "перетягування"
// }

// function drag(event) {
//     if (isDragging) {
//         const dx = event.clientX - startX // Різниця по X
//         const dy = event.clientY - startY // Різниця по Y

//         scrollX += dx // Оновлення горизонтального зсуву
//         scrollY += dy // Оновлення вертикального зсуву

//         // Встановлення нових позицій
//         mapImage.style.left = scrollX + 'px'
//         mapImage.style.top = scrollY + 'px'

//         // Оновлення початкових позицій
//         startX = event.clientX
//         startY = event.clientY
//     }
// }

// // Зупинити перетягування
// function stopDragging() {
//     isDragging = false
//     mapImage.style.cursor = 'grab' // Змінити курсор назад
//     mapContainer.style.cursor = 'grab' // Змінити курсор назад
// }

// // Додати обробники подій
// mapContainer.addEventListener('mousedown', startDragging)
// document.addEventListener('mousemove', drag)
// document.addEventListener('mouseup', stopDragging)
// // mapContainer.addEventListener('mouseleave', stopDragging)

// // Запобігання стандартній поведінці перетягування
// mapImage.ondragstart = () => {
//     return false // Скасувати перетягування
// }

// // Запобігання стандартній поведінці перетягування
// mapContainer.ondragstart = () => {
//     return false // Скасувати перетягування
// }

// // Масштабування
// document.getElementById('zoomIn').addEventListener('click', () => {
//     scale += 0.2 // Збільшити масштаб
//     updateImageScale()
// })

// document.getElementById('zoomOut').addEventListener('click', () => {
//     scale = Math.max(scale - 0.2, 0.1) // Зменшити масштаб, не менше 0.1
//     updateImageScale()
// })

// document.getElementById('reset').addEventListener('click', () => {
//     scale = 1 // Скинути масштаб
//     scrollX = 0 // Скинути позицію X
//     scrollY = 0 // Скинути позицію Y
//     updateImageScale()
//     updateImagePosition()
// })

// // Масштабування за допомогою скролу миші
// mapContainer.addEventListener(
//     'wheel',
//     (event) => {
//         event.preventDefault() // Скасувати стандартну прокрутку

//         const mouseX = event.clientX - mapContainer.getBoundingClientRect().left // Позиція миші по X відносно контейнера
//         const mouseY = event.clientY - mapContainer.getBoundingClientRect().top // Позиція миші по Y відносно контейнера

//         const scaleFactor = 1.1 // Фактор масштабу
//         const newScale = event.deltaY < 0 ? scale * scaleFactor : scale / scaleFactor // Змінюємо масштаб

//         const scaleChange = newScale / scale // Визначаємо, як змінився масштаб
//         const newScrollX = (scrollX - mouseX) * scaleChange + mouseX // Визначаємо нову позицію X
//         const newScrollY = (scrollY - mouseY) * scaleChange + mouseY // Визначаємо нову позицію Y

//         console.log(JSON.stringify({ mouseX, mouseY, scaleChange, newScrollX, newScrollY }))

//         scale = newScale // Оновлюємо масштаб
//         scrollX = newScrollX // Оновлюємо позицію X
//         scrollY = newScrollY // Оновлюємо позицію Y

//         updateImageScale() // Оновлюємо масштаб зображення
//         updateImagePosition() // Оновлюємо позицію зображення
//     },
//     { passive: false },
// )

// // Функція для оновлення масштабу зображення
// function updateImageScale() {
//     mapImage.style.transform = `scale(${scale})`
// }

// // Функція для оновлення позиції зображення
// function updateImagePosition() {
//     mapImage.style.left = scrollX + 'px'
//     mapImage.style.top = scrollY + 'px'
// }
