document.addEventListener('DOMContentLoaded', () => {
    // Dropdown toggle
    const userTrigger = document.getElementById('user-menu-trigger')
    const dropdown = document.getElementById('user-dropdown')
    if (userTrigger && dropdown) {
        userTrigger.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            dropdown.classList.toggle('dropdown--open')
        })

        document.addEventListener('click', () => {
            dropdown.classList.remove('dropdown--open')
        })
    }

    // Sidebar toggle left
    const leftSidebar = document.getElementById('left-sidebar')
    const leftSidebarToggle = document.getElementById('sidebar-toggle')
    if (leftSidebar && leftSidebarToggle) {
        leftSidebarToggle.style.display = 'flex'

        leftSidebarToggle.addEventListener('click', (event) => {
            event.preventDefault()
            leftSidebar.classList.toggle('is-collapsed')
        })
    }
    if (!leftSidebar && leftSidebarToggle) {
        leftSidebarToggle.style.display = 'none'
    }

    // Sidebar toggle right
    const rightSidebar = document.querySelector('#sidebar-right')
    const rightSidebarToggle = document.querySelector('.sidebar-toggle-right')
    if (rightSidebar && rightSidebarToggle) {
        rightSidebarToggle.addEventListener('click', () => {
            rightSidebar.classList.toggle('is-hidden')
        })
    }

    // Active left nav menu
    const currentPath = window.location.pathname
    const navLinks = document.querySelectorAll('.page-layout__nav-item')

    navLinks.forEach((link) => {
        // Отримуємо чистий шлях з атрибута href посилання
        const linkPath = link.getAttribute('href')

        // Перевіряємо точний збіг або чи є лінк частиною підрозділу
        if (currentPath === linkPath || (linkPath !== '/' && currentPath.startsWith(linkPath))) {
            link.classList.add('active')
            link.setAttribute('aria-current', 'page') // Для доступності
        } else {
            link.classList.remove('active')
            link.removeAttribute('aria-current')
        }
    })

    // Logout
    const logoutButton = document.querySelector('#logout-link')

    if (logoutButton) {
        logoutButton.addEventListener('click', async (event) => {
            event.preventDefault()

            try {
                const response = await fetch('/api/v1/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                })

                if (response.ok) {
                    window.location.href = '/login'
                } else {
                    console.error(`Вихід не вдаcontinuous: статус ${response.status}`)
                }
            } catch (networkError) {
                console.error('Помилка мережі при спробі виходу:', networkError)
            }
        })
    }
})
