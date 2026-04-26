document.addEventListener('DOMContentLoaded', () => {
    
    // 1. АВАТАР КОРИСТУВАЧА
    const userNameEl = document.querySelector('.user-profile__name');
    const avatarEl = document.getElementById('user-avatar');
    if (userNameEl && avatarEl) {
        avatarEl.textContent = userNameEl.textContent.trim()
            .split(' ')
            .map(word => word[0]).join('').toUpperCase().substring(0, 2);
    }

    // 2. ПЕРЕМИКАЧ ТЕМ (Темна за замовчуванням)
    const htmlTag = document.documentElement;
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    
    const savedTheme = localStorage.getItem('appTheme') || 'dark';
    htmlTag.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = htmlTag.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            
            htmlTag.setAttribute('data-theme', newTheme);
            localStorage.setItem('appTheme', newTheme);
            updateThemeIcon(newTheme);
        });
    }

    function updateThemeIcon(theme) {
        if (!themeIcon) return;
        themeIcon.className = theme === 'light' ? 'ph ph-moon' : 'ph ph-sun';
    }

    // 3. ВИПАДАЮЧЕ МЕНЮ ПРОФІЛЮ
    const profileTrigger = document.getElementById('user-profile-trigger');
    const userDropdown = document.getElementById('user-dropdown');
    
    if (profileTrigger && userDropdown) {
        profileTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('dropdown--active');
        });
        document.addEventListener('click', (e) => {
            if (!profileTrigger.contains(e.target)) {
                userDropdown.classList.remove('dropdown--active');
            }
        });
    }

    // 4. ЛІВИЙ САЙДБАР
    const leftSidebar = document.getElementById('left-sidebar');
    const toggleLeftBtn = document.getElementById('toggle-left');
    
    if (leftSidebar && toggleLeftBtn) {
        const leftState = localStorage.getItem('leftSidebarState');
        if (leftState === 'expanded') leftSidebar.classList.remove('sidebar--collapsed');

        toggleLeftBtn.addEventListener('click', () => {
            leftSidebar.classList.toggle('sidebar--collapsed');
            localStorage.setItem('leftSidebarState', 
                leftSidebar.classList.contains('sidebar--collapsed') ? 'collapsed' : 'expanded'
            );
        });
    }

    // 5. ПРАВИЙ САЙДБАР
    const rightSidebar = document.getElementById('right-sidebar');
    const toggleRightBtn = document.getElementById('toggle-right');

    if (rightSidebar && toggleRightBtn) {
        // Показуємо кнопку, оскільки сайдбар існує
        toggleRightBtn.style.display = 'flex';

        toggleRightBtn.addEventListener('click', () => {
            rightSidebar.classList.toggle('sidebar--collapsed');
            toggleRightBtn.classList.toggle('is-active');
        });
    } else if (toggleRightBtn) {
        // Якщо хтось видалив HTML правого меню, ховаємо кнопку
        toggleRightBtn.style.display = 'none';
    }
});