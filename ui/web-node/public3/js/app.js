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
    const sidebarRightWrapper = document.getElementById('sidebarRightWrapper'); 

    if (toggleRightBtn && sidebarRightWrapper) {
        toggleRightBtn.addEventListener('click', () => {
            const isCollapsed = sidebarRightWrapper.classList.toggle('collapsed');
            
            const icon = toggleRightBtn.querySelector('svg');
            if (icon) {
                icon.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
            }
        });
    }
});