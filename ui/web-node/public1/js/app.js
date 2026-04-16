document.addEventListener('DOMContentLoaded', () => {
    
    // --- Логіка User Dropdown ---
    const userProfileBtn = document.getElementById('userProfileBtn');
    const userDropdown = document.getElementById('userDropdown');

    if (userProfileBtn && userDropdown) {
        userProfileBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Запобігаємо спливанню події
            userDropdown.classList.toggle('active');
        });

        // Закриваємо меню при кліку поза ним
        document.addEventListener('click', (e) => {
            if (!userProfileBtn.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.classList.remove('active');
            }
        });
    }

    // --- Логіка Left Sidebar ---
    const toggleLeftBtn = document.getElementById('toggleLeftBtn');
    const sidebarLeft = document.getElementById('sidebarLeft');

    if (toggleLeftBtn && sidebarLeft) {
        toggleLeftBtn.addEventListener('click', () => {
            sidebarLeft.classList.toggle('collapsed');
        });
    }

    // --- Логіка Right Sidebar ---
    const toggleRightBtn = document.getElementById('toggleRightBtn');
    const sidebarRight = document.getElementById('sidebarRight');

    if (toggleRightBtn && sidebarRight) {
        toggleRightBtn.addEventListener('click', () => {
            sidebarRight.classList.toggle('collapsed');
        });
    }
});