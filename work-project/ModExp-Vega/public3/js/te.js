const trigger = document.querySelector('.profile-info-trigger')
const dropdown = document.querySelector('.modern-dropdown')

trigger.addEventListener('click', (e) => {
    e.stopPropagation() // щоб клік не йшов далі
    dropdown.classList.toggle('is-active')
})

// Закриття при кліку в будь-якому іншому місці
document.addEventListener('click', () => {
    dropdown.classList.remove('is-active')
})

//

// const leftSidebar = document.getElementById('sidebarLeft')
// const leftToggle = document.getElementById('sidebarLeftToggle')

// leftToggle.addEventListener('click', () => {
//     leftSidebar.classList.toggle('is-collapsed')
// })

document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebarLeft')
    const toggle = document.getElementById('sidebarLeftToggle')

    if (toggle && sidebar) {
        toggle.addEventListener('click', (e) => {
            e.preventDefault()
            sidebar.classList.toggle('is-collapsed')

            // Схема адаптивна до розміру контейнера,
            // тому викликаємо resize події для коректного перерахунку
            window.dispatchEvent(new Event('resize'))
        })
    }
})
