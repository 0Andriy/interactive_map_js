document.addEventListener('DOMContentLoaded', () => {
    // Dropdown toggle
    const userTrigger = document.getElementById('user-menu-trigger')
    const dropdown = document.getElementById('user-dropdown')
    if (userTrigger && dropdown) {
        userTrigger.addEventListener('click', (event) => {
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

        leftSidebarToggle.addEventListener('click', () => {
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
})
