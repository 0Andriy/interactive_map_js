document.addEventListener('DOMContentLoaded', () => {
    
    // --- Логіка User Dropdown ---
    const userProfileBtn = document.getElementById('userProfileBtn');
    const userDropdown = document.getElementById('userDropdown');

    if (userProfileBtn && userDropdown) {
        userProfileBtn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            userDropdown.classList.toggle('active');
        });

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
    // Зверни увагу, ми тепер перемикаємо клас на обгортці!
    const sidebarRightWrapper = document.getElementById('sidebarRightWrapper'); 

    if (toggleRightBtn && sidebarRightWrapper) {
        toggleRightBtn.addEventListener('click', () => {
            sidebarRightWrapper.classList.toggle('collapsed');
        });
    }
});