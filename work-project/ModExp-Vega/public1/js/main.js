document.addEventListener('DOMContentLoaded', () => {
    // Sidebar Toggles
    const leftSide = document.getElementById('leftSide')
    const rightSide = document.getElementById('rightSide')
    const leftToggle = document.getElementById('leftToggle')
    const rightToggle = document.getElementById('rightToggle')

    leftToggle?.addEventListener('click', () => leftSide.classList.toggle('collapsed'))
    rightToggle?.addEventListener('click', () => rightSide.classList.toggle('hidden'))

    // User Dropdown
    const profileTrigger = document.getElementById('profileTrigger')
    const userDropdown = document.getElementById('userDropdown')

    profileTrigger?.addEventListener('click', (e) => {
        e.stopPropagation()
        userDropdown.classList.toggle('active')
    })

    window.addEventListener('click', () => userDropdown?.classList.remove('active'))

    // Mobile Logic
    const burger = document.getElementById('burgerBtn')
    const overlay = document.getElementById('overlay')

    if (window.innerWidth <= 768) {
        if (burger) burger.style.display = 'block'
    }

    burger?.addEventListener('click', () => {
        leftSide.classList.add('mobile-open')
        overlay.classList.add('active')
    })

    overlay?.addEventListener('click', () => {
        leftSide.classList.remove('mobile-open')
        overlay.classList.remove('active')
    })
})
