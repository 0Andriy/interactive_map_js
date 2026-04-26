document.addEventListener('DOMContentLoaded', () => {
    // 1. Генерація ініціалів
    const userNameElement = document.querySelector('.user-name');
    const userAvatarElement = document.getElementById('user-avatar');
    
    if (userNameElement && userAvatarElement) {
        const fullName = userNameElement.textContent.trim();
        const initials = fullName
            .split(' ')
            .map(word => word[0])
            .join('')
            .toUpperCase()
            .substring(0, 2); // Беремо максимум 2 літери
        
        userAvatarElement.textContent = initials;
    }

    // 2. Логіка логотипу (використання BOM - window.location)
    const appLogo = document.getElementById('app-logo');
    if (appLogo) {
        appLogo.addEventListener('click', () => {
            // В реальному житті це: window.location.href = '/';
            console.log('Повернення на головну...');
            window.scrollTo(0,0);
        });
    }

    // 3. Відкриття/Закриття меню користувача
    const profileTrigger = document.getElementById('user-profile-trigger');
    const userDropdown = document.getElementById('user-dropdown');

    if (profileTrigger && userDropdown) {
        profileTrigger.addEventListener('click', (e) => {
            e.stopPropagation(); // Запобігаємо закриттю одразу
            userDropdown.classList.toggle('active');
        });

        // Закриття при кліку поза меню
        document.addEventListener('click', (e) => {
            if (!profileTrigger.contains(e.target)) {
                userDropdown.classList.remove('active');
            }
        });
    }

    // 4. Логіка лівого сайдбару (з використанням BOM - localStorage)
    const btnToggleLeft = document.getElementById('toggle-left');
    const leftSidebar = document.getElementById('left-sidebar');

    // Відновлення стану з localStorage
    const savedLeftState = localStorage.getItem('leftSidebarState');
    if (savedLeftState === 'expanded') {
        leftSidebar.classList.remove('collapsed');
    }

    btnToggleLeft.addEventListener('click', () => {
        leftSidebar.classList.toggle('collapsed');
        // Зберігаємо стан в BOM
        const isCollapsed = leftSidebar.classList.contains('collapsed');
        localStorage.setItem('leftSidebarState', isCollapsed ? 'collapsed' : 'expanded');
    });

    // 5. Логіка правого сайдбару
    const btnToggleRight = document.getElementById('toggle-right');
    const rightSidebar = document.getElementById('right-sidebar');

    btnToggleRight.addEventListener('click', () => {
        rightSidebar.classList.toggle('collapsed');
    });
});