document.addEventListener('DOMContentLoaded', () => {
    
    /* ================= 1. МІЛІСЕКУНДНИЙ ТАЙМЕР ================= */
    const timestampEl = document.getElementById('liveTimestamp');
    if (timestampEl) {
        setInterval(() => {
            const now = new Date();
            const pad = (n, len=2) => String(n).padStart(len, '0');
            const str = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ` +
                        `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.` +
                        `${pad(now.getMilliseconds(), 3)}`;
            timestampEl.textContent = str;
        }, 47); // Оновлення ~20 разів на секунду
    }

    /* ================= 2. ПОВНОЕКРАННИЙ РЕЖИМ (СХЕМА) ================= */
    const schemaWidget = document.getElementById('schemaWidget');
    const toggleFsBtn = document.getElementById('toggleFullscreen');

    if (schemaWidget && toggleFsBtn) {
        toggleFsBtn.addEventListener('click', () => {
            schemaWidget.classList.toggle('fullscreen');
            
            // Змінюємо іконку
            const icon = toggleFsBtn.querySelector('svg');
            if (schemaWidget.classList.contains('fullscreen')) {
                icon.innerHTML = `<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>`;
            } else {
                icon.innerHTML = `<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>`;
            }
            
            // Перемальовуємо лінії після анімації переходу (0.3s)
            setTimeout(drawConnections, 350); 
        });
    }

    /* ================= 3. МАЛЮВАННЯ SVG ЛІНІЙ ================= */
    const svgLayer = document.getElementById('svgLayer');
    
    // Масив зв'язків: від якого ID до якого малювати лінію
    const connections = [
        { from: 'node-a', to: 'node-b' },
        { from: 'node-b', to: 'node-c' },
        { from: 'node-a', to: 'node-c' } // Можна утворювати трикутники/мережі
    ];

    function drawConnections() {
        if (!svgLayer) return;
        
        const bodyRect = document.getElementById('schemaBody').getBoundingClientRect();
        
        // Очищаємо старі лінії
        svgLayer.innerHTML = '';

        connections.forEach(conn => {
            const el1 = document.getElementById(conn.from);
            const el2 = document.getElementById(conn.to);
            if (!el1 || !el2) return;

            const rect1 = el1.getBoundingClientRect();
            const rect2 = el2.getBoundingClientRect();

            // Вираховуємо центр елементів відносно батьківського контейнера (schemaBody)
            const x1 = rect1.left - bodyRect.left + (rect1.width / 2);
            const y1 = rect1.top - bodyRect.top + (rect1.height / 2);
            const x2 = rect2.left - bodyRect.left + (rect2.width / 2);
            const y2 = rect2.top - bodyRect.top + (rect2.height / 2);

            // Створюємо SVG лінію
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            line.setAttribute('class', 'schema-line');
            
            svgLayer.appendChild(line);
        });
    }

    // Малюємо при завантаженні та при кожній зміні розміру вікна
    if (document.getElementById('schemaBody')) {
        drawConnections();
        window.addEventListener('resize', drawConnections);
    }

    /* ================= 4. МОБІЛЬНЕ МЕНЮ (Drawers) ================= */
    // Припустимо, ти додаси кнопку <button class="mobile-menu-btn" id="mobMenuBtn"> у header
    const mobMenuBtn = document.getElementById('mobMenuBtn');
    const sidebarLeft = document.getElementById('sidebarLeft');

    if (mobMenuBtn && sidebarLeft) {
        mobMenuBtn.addEventListener('click', () => {
            sidebarLeft.classList.toggle('mobile-open');
        });
    }
});